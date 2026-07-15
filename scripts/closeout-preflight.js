'use strict';

const { execFileSync } = require('node:child_process');
const megalint = require('./megalint');
const { execute } = require('./github-dispatcher');
const batonBack = require('./baton-back');

function extractIssueFromBranch(branch) {
  const m = String(branch || '').match(/(?:feat|fix|chore|docs|refactor|perf|hotfix)\/(\d+)-/i);
  return m ? Number(m[1]) : null;
}
function currentBranch() {
  return (process.env.CLOSEOUT_PREFLIGHT_BRANCH || execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' })).trim();
}
async function readIssue(issueNum, opts = {}) {
  if (process.env.CLOSEOUT_PREFLIGHT_ISSUE_JSON) return JSON.parse(process.env.CLOSEOUT_PREFLIGHT_ISSUE_JSON);
  const res = await execute('get-issue', { issue: issueNum, json: 'body,comments,title,labels,state' }, opts);
  if (!res.ok) throw new Error(res.error || res.reason || 'issue lookup failed');
  if (res.provider === 'gh-cli') return JSON.parse(res.stdout || '{}');
  const payload = res.result?.issue || res.result;
  if (!payload || typeof payload !== 'object') throw new Error('invalid MCP issue payload');
  return payload;
}
function normalizeComments(comments) {
  return (comments || []).map((c) => ({ body: c.body || '', user: c.user ? { login: c.user.login } : undefined }));
}
function normalizeLabels(labels) {
  return (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
}
function deriveLaneFromLabels(labels) {
  return (labels || []).find((l) => typeof l === 'string' && l.startsWith('lane:')) || 'lane:code-change';
}
function toValidatorInput(issue, issueNum, branch) {
  const body = issue.body || '';
  const labels = normalizeLabels(issue.labels);
  return {
    body, comments: normalizeComments(issue.comments), labels, lane: deriveLaneFromLabels(labels),
    prBody: '', state: issue.state || 'open', ticketRef: issueNum, branch,
    isEpic: /\bEPIC\b/i.test(issue.title || '') || /##\s*Epic Summary/i.test(body),
  };
}
async function fetchPrBody(branch, opts = {}) {
  if (process.env.CLOSEOUT_PREFLIGHT_PR_BODY) return process.env.CLOSEOUT_PREFLIGHT_PR_BODY.trim();
  try {
    const res = await execute('get-pull-request', { issue: branch, json: 'body' }, opts);
    if (!res.ok) return null;
    if (res.provider === 'gh-cli') return (JSON.parse(res.stdout || '{}').body || '').trim();
    const payload = res.result?.pullRequest || res.result || {};
    return typeof payload.body === 'string' ? payload.body.trim() : null;
  } catch { return null; }
}

// #3169: deferred-final flow — the CONSULTANT_CLOSEOUT is meant to cite the PR,
// which does not exist at first push. Forcing the consultant-closeout check at
// pre-push inverts the baton (teams post the closeout before the PR). Defer the
// consultant-closeout check to PR-open: require it only once the PR exists, OR
// validate an already-posted closeout if a team posts one early. Downstream
// enforcement (required CI consultant-gate, merge-evidence-pr-gate, and the
// pretool_guard merge-recorded close gate) keeps the closeout mandatory before
// merge and issue close, so deferral relaxes ordering, never enforcement.
// Match an actual CONSULTANT_CLOSEOUT *artifact* (a comment whose body carries the
// artifact header), NOT a prose mention of the string — other baton artifacts
// (MANAGER_HANDOFF, EDD, COLLABORATOR_HANDOFF) routinely reference "CONSULTANT_CLOSEOUT"
// in their text, which an unanchored match would wrongly treat as a posted closeout.
const CLOSEOUT_ARTIFACT_RE = /(?:^|\n)\s*(?:##\s*)?CONSULTANT_CLOSEOUT\b/i;
function hasCloseoutComment(comments) {
  return (comments || []).some((c) => CLOSEOUT_ARTIFACT_RE.test(c.body || ''));
}

// #3328: a posted COLLABORATOR_HANDOFF *artifact* (header on its own line), not a
// prose mention inside another artifact. Anchored like CLOSEOUT_ARTIFACT_RE so a
// MANAGER_HANDOFF that names "COLLABORATOR_HANDOFF" in its scope text never trips it.
const COLLAB_HANDOFF_ARTIFACT_RE = /(?:^|\n)\s*(?:\*\*|##\s*)?COLLABORATOR_HANDOFF\b/i;
function hasCollaboratorHandoff(comments) {
  return (comments || []).some((c) => COLLAB_HANDOFF_ARTIFACT_RE.test(c.body || ''));
}

// #3328: the local pre-push preflight now runs `doc-coverage` with the SAME strictness
// as CI's collaborator-gate — but ONLY once a COLLABORATOR_HANDOFF is actually posted.
// The doc-coverage validator falls back to the issue body when no handoff is present,
// which would false-fail every legitimate pre-handoff push ("missing doc-coverage
// block"). Gating on handoff presence keeps ordering relaxed while closing the
// format-parity gap (#3315 recurrence) the moment the artifact exists.
function selectPreflightValidators(prExists, closeoutAlreadyPosted, collaboratorHandoffPosted) {
  const validators = ['manager-handoff'];
  if (collaboratorHandoffPosted) validators.push('doc-coverage');
  const enforceCloseoutNow = prExists || closeoutAlreadyPosted;
  if (enforceCloseoutNow) validators.push('consultant-closeout');
  if (prExists) validators.push('merge-evidence-pr-gate');
  return { validators, closeoutDeferred: !enforceCloseoutNow };
}

// Baton-back close-gate invariant (#3257): a ticket may not close while a
// baton-back marker is still open on the timeline. Enforce only when the
// closeout itself is being enforced (not deferred), so it gates close-time,
// not ordinary intermediate pushes. Returns true when the gate blocks.
function batonBackGateBlocks(comments, closeoutDeferred, issueNum) {
  if (closeoutDeferred || !batonBack.anyOpen(comments)) return false;
  console.error(`closeout-preflight: FAIL [baton-back-close-gate] #${issueNum} — open baton-back marker; remediate + clear before close`);
  return true;
}

async function run(opts = {}) {
  if (process.env.SKIP_CLOSEOUT_PREFLIGHT === '1') { console.log('closeout-preflight: skipped (SKIP_CLOSEOUT_PREFLIGHT=1)'); return 0; }
  const branch = currentBranch();
  const issueNum = extractIssueFromBranch(branch);
  if (!issueNum) { console.log('closeout-preflight: skip (no ticket branch)'); return 0; }
  let issue;
  try { issue = await readIssue(issueNum, opts); }
  catch (error) { console.error(`closeout-preflight: unable to load issue #${issueNum}: ${error.message}`); return 1; }
  const input = toValidatorInput(issue, issueNum, branch);
  const prBody = await fetchPrBody(branch, opts);
  if (prBody !== null) input.prBody = prBody;
  const { validators, closeoutDeferred } = selectPreflightValidators(
    prBody !== null, hasCloseoutComment(input.comments),
    hasCollaboratorHandoff(input.comments));
  if (closeoutDeferred) {
    console.log(`closeout-preflight: consultant-closeout deferred to PR-open (deferred-final flow; no PR yet) #${issueNum}`);
  }
  let failed = batonBackGateBlocks(input.comments, closeoutDeferred, issueNum);
  for (const name of validators) {
    const result = megalint.run(name, { ...input, issueNumber: issueNum });
    if (result.ok) continue;
    failed = true; console.error(`closeout-preflight: FAIL [${name}] #${issueNum}`);
    for (const violation of result.violations || []) console.error(`  - ${violation.rule}: ${violation.detail}`);
  }
  if (failed) return 1;
  console.log(`closeout-preflight: PASS #${issueNum}`);
  return 0;
}

if (require.main === module) run().then((code) => process.exit(code));

module.exports = { extractIssueFromBranch, readIssue, fetchPrBody, toValidatorInput, run,
  hasCloseoutComment, hasCollaboratorHandoff, selectPreflightValidators, batonBackGateBlocks };
