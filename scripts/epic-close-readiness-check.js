'use strict';
// Epic Close-Readiness Gate logic (#452 / #750 / #1306 / #3350).
// Matcher union: task-list edges + explicit `Parent:` refs + GitHub native
// parentIssue + cross-ref children whose OWN body asserts this epic as parent
// (#3350 — the class that let #3021/#2891 close with open children). The #1306
// false-positive class (prose `#N` in the EPIC body) is NOT reintroduced: the
// new edge is a child-side assertion, evaluated over live open issues only.
const ERROR_MSG_MAX = 1500;
const childState = require('./epic-child-state');

function parseTaskListChildren(epicBody) {
  const refs = new Set();
  const lines = (epicBody || '').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*-\s*\[[ xX]\]\s+.*?#(\d+)\b/);
    if (m) refs.add(Number(m[1]));
  }
  return refs;
}

function parseParentRef(issue, epicNum, owner, repo) {
  const txt = `${issue.title || ''}\n${issue.body || ''}`;
  if (new RegExp(`\\bParent:\\s*#${epicNum}\\b`).test(txt)) return 'parent-text';
  const urlRe = new RegExp(`\\bParent:\\s*https://github\\.com/${owner}/${repo}/issues/${epicNum}\\b`);
  if (urlRe.test(txt)) return 'parent-url';
  return null;
}

async function listOpenIssues(github, owner, repo) {
  let after = null; let parentSupported = true; const nodes = [];
  const query = (wp) => `query($owner:String!,$repo:String!,$after:String){repository(owner:$owner,name:$repo){issues(first:100,states:OPEN,after:$after){nodes{number title body labels(first:20){nodes{name}}${wp ? ' parentIssue{number}' : ''}} pageInfo{hasNextPage endCursor}}}}`;
  for (;;) {
    let data;
    try { data = await github.graphql(query(parentSupported), { owner, repo, after }); }
    catch (e) {
      if (parentSupported && /parentIssue/i.test(String(e.message))) { parentSupported = false; continue; }
      throw e;
    }
    const block = data.repository.issues;
    nodes.push(...block.nodes);
    if (!block.pageInfo.hasNextPage) return { nodes, parentSupported };
    after = block.pageInfo.endCursor;
  }
}

// Build the candidate shape epic-child-state.openChildUnion consumes from a
// live open-issue node. All nodes are open (states:OPEN query).
function toCandidate(node, epicNum, owner, repo, taskList, parentSupported) {
  return {
    number: node.number,
    title: node.title,
    state: 'open',
    body: node.body || '',
    nativeParent: parentSupported && node.parentIssue ? node.parentIssue.number : null,
    inTaskList: taskList.has(node.number),
    parentText: parseParentRef(node, epicNum, owner, repo),
  };
}

async function restoreEpicLabels(github, owner, repo, epicNum, epic) {
  const labels = epic.labels.map(label => label.name);
  const toRemove = [];
  if (labels.includes('status:done')) toRemove.push('status:done');
  for (const resolutionLabel of ['resolution:released', 'resolution:completed']) {
    if (labels.includes(resolutionLabel)) toRemove.push(resolutionLabel);
  }
  for (const labelToRemove of toRemove) {
    await github.rest.issues.removeLabel({ owner, repo, issue_number: epicNum, name: labelToRemove }).catch(() => {});
  }
  if (labels.includes('status:done')) {
    await github.rest.issues.addLabels({ owner, repo, issue_number: epicNum, labels: ['status:review'] }).catch(() => {});
  }
}

// AC2 reconciliation: read the epic's CONSULTANT(_EPIC)_CLOSEOUT and compare its
// children-terminal claim against the live open-child union.
async function loadCloseout(github, owner, repo, epicNum) {
  const { data: comments } = await github.rest.issues
    .listComments({ owner, repo, issue_number: epicNum, per_page: 100 }).catch(() => ({ data: [] }));
  const match = comments.filter(c => /CONSULTANT(_EPIC)?_CLOSEOUT/i.test(c.body || '')).pop();
  return match ? match.body : '';
}

// AC4 eventual-consistency re-check: re-fetch each union child's live state
// immediately before reopening; keep only those still open.
async function recheckStillOpen(github, owner, repo, open) {
  const states = await Promise.all(open.map(c =>
    github.rest.issues.get({ owner, repo, issue_number: c.number })
      .then(r => (r.data.state === 'open' ? c : null))
      .catch(() => c) // API hiccup: keep candidate rather than silently clear (fail-safe)
  ));
  return states.filter(Boolean);
}

function emitIncident(epicNum, open) {
  try {
    const store = require('./incidents-store');
    store.append(childState.buildIncidentRecord(epicNum, open));
  } catch (e) { /* best-effort observability; never block the gate */ }
}

function buildBlockerNote(epicNum, open, parentSupported, reconciliation) {
  const lines = open.map(c => `- #${c.number}: ${c.title} _(match: ${c.why})_`).join('\n');
  let note = `## Epic Close-Readiness Violation\n\nOpen child issues detected for epic #${epicNum}:\n\n${lines}\n\n` +
    `Parent field support: ${parentSupported ? 'enabled' : 'not available in this API context'}\n\n` +
    `_Auto-reopened by Epic Close-Readiness Gate (union matcher, ${open.length} child${open.length === 1 ? '' : 'ren'})._\n\n` +
    '**Status restoration**: `status:done` and `resolution:*` labels removed; `status:review` re-applied.';
  if (reconciliation && reconciliation.mismatch) {
    const falsely = reconciliation.falselyAssertedClosed.length
      ? ` Specifically, the closeout asserted these as terminal while live-open: ${reconciliation.falselyAssertedClosed.map(n => `#${n}`).join(', ')}.`
      : '';
    note += `\n\n**Closeout reconciliation FAILED**: a CONSULTANT_CLOSEOUT is present but ${open.length} child(ren) remain open.${falsely} The closeout children-terminal claim is contradicted by live state (#3350 / #3021 false-claim class).`;
  }
  return note;
}

// Reopen an invalidly-closed epic: re-check (eventual consistency), decide (flap-
// safe), then comment + reopen + restore labels + emit incident. Returns true if
// the epic was reopened. Split out of run() to keep each unit small + testable.
async function reopenIfStillViolating(github, owner, repo, epic, open, parentSupported, reconciliation, dryRun, core) {
  const confirmed = dryRun ? open : await recheckStillOpen(github, owner, repo, open);
  const decision = childState.decideReopen({
    initialOpenCount: open.length, recheckOpenCount: confirmed.length,
  });
  if (!decision.reopen) {
    console.log(`Epic #${epic.number}: not reopening (${decision.reason}).`);
    return false;
  }
  const body = buildBlockerNote(epic.number, confirmed, parentSupported, reconciliation);
  if (dryRun) { console.log(`DRY RUN — would reopen #${epic.number}:\n${body}`); return false; }
  await github.rest.issues.createComment({ owner, repo, issue_number: epic.number, body });
  await github.rest.issues.update({ owner, repo, issue_number: epic.number, state: 'open' });
  await restoreEpicLabels(github, owner, repo, epic.number, epic);
  emitIncident(epic.number, confirmed);
  core.setFailed(`Epic #${epic.number} re-opened: ${confirmed.length} open child(ren).`);
  return true;
}

async function run({ github, context, core }) {
  const dryRun = process.env.DRY_RUN === 'true';
  const epicNum = (dryRun && context.payload.inputs?.epic_number)
    ? Number(context.payload.inputs.epic_number)
    : context.issue?.number;
  if (!epicNum) { core.setFailed('No epic number provided.'); return; }
  const { owner, repo } = context.repo;
  try {
    const { data: epic } = await github.rest.issues.get({ owner, repo, issue_number: epicNum });
    const taskList = parseTaskListChildren(epic.body);
    const { nodes, parentSupported } = await listOpenIssues(github, owner, repo);
    const candidates = nodes.map(n => toCandidate(n, epicNum, owner, repo, taskList, parentSupported));
    const open = childState.openChildUnion(epicNum, candidates);
    if (!open.length) {
      if (dryRun) console.log(`Epic #${epicNum}: zero open children. Close is valid.`);
      return;
    }
    const closeoutBody = await loadCloseout(github, owner, repo, epicNum);
    const reconciliation = childState.reconcileCloseoutAssertion({
      closeoutBody, openChildNumbers: open.map(c => c.number),
    });
    await reopenIfStillViolating(github, owner, repo, epic, open, parentSupported, reconciliation, dryRun, core);
  } catch (error) {
    const msg = String(error.message || error).slice(0, ERROR_MSG_MAX);
    await github.rest.issues.createComment({
      owner, repo, issue_number: epicNum,
      body: `## Epic Close-Readiness Diagnostic Failure\n\nValidation failed: \`${msg}\``
    }).catch(() => {});
    core.setFailed(`Close-readiness diagnostic failed: ${msg}`);
  }
}

module.exports = {
  run, parseTaskListChildren, parseParentRef, restoreEpicLabels, toCandidate,
  loadCloseout, recheckStillOpen, buildBlockerNote,
};
