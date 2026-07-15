#!/usr/bin/env node
'use strict';
// #2252 — worktree lifecycle evidence for session start + baton gates (Epic #2248).
const { inventory, ticketFrom } = require('./worktree-inventory');
const { plan } = require('./worktree-cleanup-plan');
const { LIGHTWEIGHT, laneSeverity } = require('./lane-enum');

const COUNT_KEYS = ['stale-safe', 'stale-risky', 'detached-temp', 'rescue-needed'];

function skipLane(lane) {
  return LIGHTWEIGHT.includes(lane) || laneSeverity(lane) === 'issue-only';
}
function extractField(body, field) {
  const m = String(body || '').match(new RegExp(`(?:^|\\n)[-*]?\\s*${field}\\s*:\\s*([^\\n]+)`, 'i'));
  return m ? m[1].trim() : null;
}
function summarize(inv) {
  const counts = Object.fromEntries(COUNT_KEYS.map((k) => [k, 0]));
  for (const w of inv?.worktrees || []) if (counts[w.lifecycleState] !== undefined) counts[w.lifecycleState]++;
  return { counts, total: (inv?.worktrees || []).length };
}
function sessionDiagnosis(opts = {}) {
  const inv = opts.inventory || inventory(undefined, { runGh: null });
  const summary = summarize(inv);
  const text = COUNT_KEYS.map((k) => `${k}=${summary.counts[k]}`).join(' ');
  return { summary, text, inventory: inv };
}
function isUnsafeBranch(branch) {
  return !branch || branch === 'HEAD' || branch === 'main' || branch === 'master' || /^sandbox\//.test(branch);
}
function checkManager(body, input = {}) {
  const lane = extractField(body, 'lane') || input.lane || '';
  if (skipLane(lane) || !/lane:code-change/i.test(lane)) return [];
  const branch = extractField(body, 'worktree_branch') || input.branch;
  const ticket = input.ticketRef || input.issueNumber;
  const out = [];
  if (!extractField(body, 'worktree_branch')) {
    out.push({ rule: 'missing-worktree-branch', detail: 'MANAGER_HANDOFF requires worktree_branch: feat/<N>-<slug> for lane:code-change' });
  }
  if (isUnsafeBranch(branch)) {
    out.push({ rule: 'worktree-unsafe-checkout', detail: `Unsafe checkout branch '${branch || 'unknown'}' — use a ticket-linked feat/fix branch in a dedicated worktree` });
  } else if (ticket && branch && ticketFrom(branch) !== Number(ticket)) {
    out.push({ rule: 'worktree-ticket-mismatch', detail: `worktree_branch '${branch}' does not reference ticket #${ticket}` });
  }
  return out;
}
function checkCollaborator(body, input = {}) {
  const lane = input.lane || '';
  if (skipLane(lane) || lane !== 'lane:code-change') return [];
  const branch = extractField(body, 'worktree_branch');
  const behind = extractField(body, 'worktree_behind_main');
  const out = [];
  if (!branch) out.push({ rule: 'missing-worktree-branch', detail: 'COLLABORATOR_HANDOFF requires worktree_branch:' });
  if (behind == null) out.push({ rule: 'missing-worktree-behind', detail: 'COLLABORATOR_HANDOFF requires worktree_behind_main:' });
  if (branch && input.branch && branch !== input.branch) {
    out.push({ rule: 'worktree-branch-mismatch', detail: `handoff worktree_branch '${branch}' != PR branch '${input.branch}'` });
  }
  return out;
}
function checkAdmin(body, input = {}) {
  if (skipLane(input.lane || '') || input.lane !== 'lane:code-change') return [];
  if (extractField(body, 'worktree_cleanup')) return [];
  const branch = input.branch || extractField(body, 'branch');
  if (!branch) return [{ rule: 'missing-worktree-cleanup', severity: 'advisory', detail: 'ADMIN_HANDOFF should include worktree_cleanup: stale-safe recommendation' }];
  const rec = staleSafeCleanup(branch);
  return rec ? [{ rule: 'missing-worktree-cleanup', detail: `ADMIN_HANDOFF missing worktree_cleanup: (suggested: ${rec})` }] : [];
}
function checkConsultant(body, input = {}) {
  if (skipLane(input.lane || '') || input.isEpic) return [];
  const field = extractField(body, 'worktree_residual_risk');
  if (!field) return [{ rule: 'missing-worktree-residual', detail: 'CONSULTANT_CLOSEOUT requires worktree_residual_risk: none | <details>' }];
  const summary = input.worktreeSummary || sessionDiagnosis().summary;
  const risky = summary.counts['stale-risky'] + summary.counts['rescue-needed'];
  if (risky > 0 && /^none\b/i.test(field)) {
    return [{ rule: 'worktree-residual-underreported', detail: `Board has ${risky} stale-risky/rescue-needed worktree(s) but closeout says none` }];
  }
  return [];
}
function staleSafeCleanup(branch) {
  const hit = plan().worktrees.find((w) => w.branch === branch && w.cleanupState === 'remove');
  return hit ? `stale-safe remove ${branch} (${hit.reason})` : null;
}

if (require.main === module) {
  if (process.argv.includes('--session-diagnosis')) {
    const d = sessionDiagnosis();
    process.stdout.write(`worktree-lifecycle: ${d.text}\n`);
    process.exit(0);
  }
  process.stdout.write('Usage: worktree-lifecycle-gate.js --session-diagnosis\n');
}

module.exports = { sessionDiagnosis, summarize, checkManager, checkCollaborator, checkAdmin, checkConsultant, staleSafeCleanup, isUnsafeBranch, skipLane, extractField, COUNT_KEYS };
