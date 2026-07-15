#!/usr/bin/env node
// git-freshness-check (#1827) — velocity-relative staleness sampler with 4-tier evaluator.
// Trunk velocity = commits_to_main_in_window / window_hours. Captures agentic-cadence reality.
// NOT calendar-day thresholds (Epic-#1771 lesson).
'use strict';

const { execSync } = require('node:child_process');

const VELOCITY_WINDOW_HOURS = Number(process.env.GIT_VELOCITY_WINDOW_HOURS || 24);
const ADAPTIVE_THRESHOLD = Number(process.env.GIT_ADAPTIVE_VELOCITY_THRESHOLD || 10);

const TIERS = [
  { name: 'ok',                 maxBehind: 3,  maxEffectiveDrift: 1.0, maxRatio: 1.0 },
  { name: 'advisory',           maxBehind: 10, maxEffectiveDrift: 3.0, maxRatio: 3.0 },
  { name: 'pre-handoff-block',  maxBehind: 30, maxEffectiveDrift: 8.0, maxRatio: 10.0 },
  { name: 're-scope',           maxBehind: Infinity, maxEffectiveDrift: Infinity, maxRatio: Infinity },
];

function git(args) {
  try { return execSync(args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function currentBranch() { return git('git rev-parse --abbrev-ref HEAD'); }

function behindCount(branch, base = 'origin/main') {
  const out = git(`git rev-list --left-right --count ${branch}...${base}`);
  if (!out) return null;
  const [, behind] = out.split(/\s+/).map(Number);
  return Number.isFinite(behind) ? behind : null;
}

function commitsOnBranch(branch, base = 'origin/main') {
  const out = git(`git rev-list --left-right --count ${branch}...${base}`);
  if (!out) return null;
  const [ahead] = out.split(/\s+/).map(Number);
  return Number.isFinite(ahead) ? ahead : null;
}

function trunkVelocity(windowHours = VELOCITY_WINDOW_HOURS, base = 'origin/main') {
  const since = `${windowHours}.hours.ago`;
  const out = git(`git log ${base} --since="${since}" --oneline`);
  const count = out ? out.split('\n').filter(Boolean).length : 0;
  return count / windowHours;
}

function classifyTier(behind, effectiveDrift, ratio) {
  for (const tier of TIERS) {
    if (behind <= tier.maxBehind && effectiveDrift <= tier.maxEffectiveDrift && ratio <= tier.maxRatio) {
      return tier.name;
    }
  }
  return 're-scope';
}

function evaluate(opts = {}) {
  const branch = opts.branch || currentBranch();
  if (process.env.MEGINGJORD_REBASE_DISCIPLINE_DISABLED === '1') {
    return { tier: 'ok', skipped: 'opt-out-env-var', branch };
  }
  if (branch === 'main' || branch === 'HEAD') {
    return { tier: 'ok', skipped: 'on-main-or-detached', branch };
  }
  const behind = opts.behind ?? behindCount(branch);
  const branchCommits = opts.branchCommits ?? commitsOnBranch(branch);
  const velocity = opts.velocity ?? trunkVelocity();
  if (behind == null) return { tier: 'unknown', reason: 'cannot-compute-behind', branch };
  const effectiveDrift = behind / Math.max(velocity, 1);
  const ratio = behind / Math.max(branchCommits ?? 1, 1);
  const tier = classifyTier(behind, effectiveDrift, ratio);
  const adaptive = velocity > ADAPTIVE_THRESHOLD;
  return { tier, branch, behind, branch_commits: branchCommits, trunk_velocity: +velocity.toFixed(2),
    effective_drift_hours: +effectiveDrift.toFixed(2), ratio: +ratio.toFixed(2),
    adaptive_cadence: adaptive };
}

function exitCodeFor(tier) {
  if (tier === 're-scope') return 2;
  if (tier === 'pre-handoff-block') return 1;
  return 0;
}

if (require.main === module) {
  const result = evaluate();
  const json = process.argv.includes('--json');
  if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    const advice = result.tier === 'ok' ? '' :
      `\n  → Run \`git fetch origin && git rebase origin/main\` (or merge if branch shared).`;
    process.stdout.write(`tier=${result.tier} behind=${result.behind} velocity=${result.trunk_velocity}/hr drift=${result.effective_drift_hours}hr ratio=${result.ratio}${advice}\n`);
  }
  process.exit(exitCodeFor(result.tier));
}

module.exports = { evaluate, classifyTier, behindCount, commitsOnBranch, trunkVelocity,
  exitCodeFor, TIERS, ADAPTIVE_THRESHOLD };
