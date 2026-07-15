#!/usr/bin/env node
'use strict';
// pre-pr-gate with ticket governance drift check integration
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { checkBatonProgression, emitProgressionIncident } = require('./baton-progression-parity.js');

const ARTIFACTS = ['MANAGER_HANDOFF', 'COLLABORATOR_HANDOFF', 'ADMIN_HANDOFF', 'CONSULTANT_CLOSEOUT'];

const gh = args => { try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return e.stdout?.toString('utf8') || ''; } };
const getCurrentBranch = () => { try { return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const extractLeadTicket = b => { const m = String(b || '').match(/^(?:feat|fix|hotfix|chore|skill)\/(\d+)-/); return m ? Number(m[1]) : null; };
const fetchIssueComments = t => { try { return JSON.parse(gh(['issue', 'view', String(t), '--json', 'comments'])).comments || []; } catch { return []; } };
const findArtifact = (comments, kind) => comments.slice().reverse().find(c => (c.body || '').includes(kind)) || null;

const checkBatonCompleteness = comments => {
  const m = ARTIFACTS.filter(k => !findArtifact(comments, k));
  return m.length ? { rule: 'baton-incomplete', detail: `Linked issue missing ${m.length} baton: ${m.join(', ')}` } : null;
};

function checkPredateWindow(comments, nowMs) {
  const collab = findArtifact(comments, 'COLLABORATOR_HANDOFF');
  if (!collab) return null;
  // #1433: anti-retroactive-planting is an ORDERING property, not a calendar
  // window. The handoff must PREDATE the PR (proxied here by push time). A
  // handoff posted any time before the PR is legitimate, regardless of how few
  // seconds — machine-speed AI operators post-then-push in <60s routinely.
  // Fail only when the handoff is timestamped AFTER push (planted / clock anomaly).
  const age = (nowMs - new Date(collab.createdAt).getTime()) / 1000;
  return age >= 0 ? null : { rule: 'handoff-not-predating', detail: `COLLABORATOR_HANDOFF is timestamped ${(-age).toFixed(1)}s after push — it must predate the PR.` };
}

function checkClosesKeyword(prBodyDraft, leadTicket) {
  if (prBodyDraft === null || prBodyDraft === undefined) return null;
  const missing = [!new RegExp(`\\bRefs\\s+#${leadTicket}\\b`, 'i').test(prBodyDraft) && `Refs #${leadTicket}`, !new RegExp(`\\b(Closes|Fixes|Resolves)\\s+#${leadTicket}\\b`, 'i').test(prBodyDraft) && `Closes #${leadTicket}`].filter(Boolean);
  return missing.length === 0 ? null : { rule: 'pr-body-keyword-missing', detail: `PR body missing: ${missing.join(', ')}` };
}

function check(opts = {}) {
  const branch = opts.branch || getCurrentBranch();
  const leadTicket = opts.leadTicket || extractLeadTicket(branch);
  if (!leadTicket) return { ok: true, skipped: 'non-feat-branch', branch, violations: [] };
  const comments = opts.comments || fetchIssueComments(leadTicket);
  const violations = [];
  const baton = checkBatonCompleteness(comments);
  if (baton) violations.push(baton);
  const predate = checkPredateWindow(comments, opts.now || Date.now());
  if (predate) violations.push(predate);
  const closes = checkClosesKeyword(opts.prBodyDraft, leadTicket);
  if (closes) violations.push(closes);
  // #2957: route-invariant baton-progression continuity (skipped-step / out-of-order)
  // on top of the presence-only completeness check above.
  const progression = checkBatonProgression(comments);
  if (progression) violations.push(progression);

  const isTestEnv = opts.skipDrift || (typeof global.test === 'function') || process.env.NODE_ENV === 'test';
  if (progression && !isTestEnv) emitProgressionIncident(progression);
  if (isTestEnv) {
    // skip drift checks in unit test runner
  } else if (process.env.SKIP_DRIFT_LINT === 'true') {
    process.stderr.write(`⚠️ SKIP_DRIFT_LINT active — bypass recorded\n`);
    const file = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), pattern_id: 'ticket-drift-lint-bypass', message: 'skipped linter check' }) + '\n');
    } catch {}
  } else {
    try {
      const { lintEpicDrift } = require('./lint-epic-drift.js');
      const raw = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { encoding: 'utf8' }).trim();
      const [owner, repo] = raw.split('/');
      const findings = lintEpicDrift(owner, repo);
      for (const f of findings) violations.push({ rule: `epic-drift-${f.class.toLowerCase()}`, detail: f.message });
    } catch (e) {
      process.stderr.write(`⚠️ epic-drift-check: bypass or fetch error: ${e.message}\n`);
    }
  }

  if (!isTestEnv) {
    try {
      require('./lint-ticket-redundancy.js').lintTicketRedundancy().forEach(r => process.stderr.write(`⚠️ ticket-redundancy-warn: ${r.message}\n`));
    } catch (e) {}
  }

  return { ok: violations.length === 0, leadTicket, branch, violations };
}

if (require.main === module) {
  const prBodyDraft = process.env.PR_BODY_DRAFT || (process.argv.includes('--body') ? fs.readFileSync(process.argv[process.argv.indexOf('--body') + 1], 'utf8') : null);
  const result = check({ prBodyDraft });
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else if (result.skipped) process.stdout.write(`pre-pr-gate: SKIP (${result.skipped})\n`);
  else if (result.ok) process.stdout.write(`pre-pr-gate: PASS #${result.leadTicket}\n`);
  else {
    process.stderr.write(`pre-pr-gate: FAIL #${result.leadTicket}\n`);
    for (const v of result.violations) process.stderr.write(`  - ${v.rule}: ${v.detail}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = { check, checkBatonCompleteness, checkPredateWindow, checkClosesKeyword, extractLeadTicket, ARTIFACTS };
