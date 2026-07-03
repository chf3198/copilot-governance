#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const MAX_BEHIND = Number(process.env.GIT_DRIFT_MAX_BEHIND || 5);
const FRESHNESS_HR = Number(process.env.GIT_DRIFT_FRESHNESS_HOURS || 24);
// Per #1439: legitimate multi-team floor is 5 (main + 4 team sandboxes:
// codex + copilot + claude-code + .claude/worktrees auto-managed). Override
// via GIT_DRIFT_MAX_CONCURRENT_WORKTREES env var.
const MAX_WORKTREES = Number(process.env.GIT_DRIFT_MAX_CONCURRENT_WORKTREES || 5);
const VALID_PFX = ['main', 'sandbox', 'release', 'hotfix', 'feat', 'fix'];
const POLICY = {
  thresholds: { max_behind_commits: MAX_BEHIND, freshness_hours: FRESHNESS_HR, max_concurrent_worktrees: MAX_WORKTREES },
  pass_statuses: { freshness: ['fresh'], worktree: ['within-limit'], target: ['compliant', 'unknown'] },
  escalation: {
    fail_when_violation_count_gte: 1,
    actions: ['run npm run git-state:drift', 'reconcile branch prefix and upstream target', 'prune/close excess worktrees'],
  },
};
const run = cmd => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };
const curBranch = () => run('git rev-parse --abbrev-ref HEAD');
const guidance = (signal, status) => {
  const key = `${signal}:${status}`;
  const map = {
    'freshness:detached': 'Check out a named branch before continuing work.',
    'freshness:invalid-prefix': `Rename to an approved prefix: ${VALID_PFX.join(', ')}.`,
    'freshness:orphaned': 'Set upstream and rebase against origin/main or approved target.',
    'freshness:stale': `Rebase/merge to keep behind count <= ${MAX_BEHIND}.`,
    'freshness:old': `Push or refresh commits within ${FRESHNESS_HR}h freshness window.`,
    'worktree:collision': `Close redundant worktrees (limit ${MAX_WORKTREES}; override via GIT_DRIFT_MAX_CONCURRENT_WORKTREES). Canonical layout: main + per-team sandboxes per the concurrent-agent-worktrees runbook in research/.`,
    'target:invalid-target': 'Retarget branch to an allowed base branch for its prefix.',
  };
  return map[key] || 'Reconcile branch/worktree state to satisfy governance policy.';
};
const freshness = () => {
  const branch = curBranch();
  if (branch === 'HEAD') return { status: 'detached', detail: 'HEAD detached' };
  const [prefix] = branch.split('/');
  if (!VALID_PFX.includes(prefix)) return { status: 'invalid-prefix', detail: `prefix "${prefix}" invalid` };
  const out = run(`git rev-list --left-right --count ${branch}...origin/main`);
  if (!out) return { status: 'orphaned', detail: `${branch} orphaned` };
  const [ahead, behind] = out.split(/\s+/).map(Number);
  if (behind > MAX_BEHIND) return { status: 'stale', detail: `behind by ${behind} (max ${MAX_BEHIND})` };
  const ageHours = Math.floor((Date.now() / 1000 - Number(run('git log -1 --format=%ct HEAD'))) / 3600);
  return ageHours > FRESHNESS_HR ? { status: 'old', detail: `${ageHours}h old (limit ${FRESHNESS_HR}h)` } : { status: 'fresh', detail: `${branch} a=${ahead} b=${behind}` };
};
const worktree = () => {
  try {
    const count = run('git worktree list --porcelain').split('\n').filter(line => line.startsWith('worktree ')).length;
    if (count <= MAX_WORKTREES) {
      return { status: 'within-limit', detail: `${count} worktrees (≤${MAX_WORKTREES} allowed)` };
    }
    return { status: 'collision', detail: `${count} concurrent worktrees (limit ${MAX_WORKTREES})` };
  } catch { return { status: 'unknown', detail: 'unavailable' }; }
};
const target = () => {
  const [prefix] = curBranch().split('/');
  const rules = { release: 'main', hotfix: 'main', sandbox: 'sandbox', feat: 'develop|main|sandbox', fix: 'develop|main|sandbox' };
  if (!rules[prefix]) return { status: 'unknown', detail: `no rule for "${prefix}"` };
  const allowed = rules[prefix].split('|');
  const hasTarget = allowed.some(name => run(`git show-ref --verify --quiet refs/remotes/origin/${name}; echo $?`) === '0');
  return hasTarget ? { status: 'compliant', detail: `"${prefix}" compliant` }
    : { status: 'invalid-target', detail: `missing allowed targets in origin: ${rules[prefix]}` };
};
const compute = () => {
  const sigs = { freshness: freshness(), worktree: worktree(), target: target() };
  const fails = Object.entries(sigs).filter(([signal, sig]) => !POLICY.pass_statuses[signal].includes(sig.status));
  const violations = fails.map(([signal, data]) => ({ signal, ...data, guidance: guidance(signal, data.status) }));
  return {
    status: violations.length >= POLICY.escalation.fail_when_violation_count_gte ? 'FAIL' : 'PASS',
    timestamp: new Date().toISOString(),
    policy: POLICY,
    signals: sigs,
    violation_count: violations.length,
    violations,
  };
};
if (require.main === module) { const result = compute(); console.log(JSON.stringify(result, null, 2)); process.exit(result.status === 'PASS' ? 0 : 1); }
module.exports = { compute, freshness, worktree, target };


