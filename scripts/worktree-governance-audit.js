#!/usr/bin/env node
/* eslint-disable jsdoc/require-jsdoc */
const { execSync } = require('child_process');

const maxBehind = Number(process.env.SANDBOX_MAX_BEHIND || 0);
const validTargets = ['copilot', 'codex', 'claude-code'];
const sandboxRx = /^sandbox\/(copilot|codex|claude-code)$/;

function parseTarget(args = process.argv.slice(2), env = process.env) {
  const inline = args.find((arg) => arg.startsWith('--target='));
  const splitAt = args.findIndex((arg) => arg === '--target');
  const value = inline ? inline.split('=')[1] : splitAt >= 0 ? args[splitAt + 1] : env.SANDBOX_TARGET;
  if (!value) return null;
  if (!validTargets.includes(value)) throw new Error(`Invalid target: ${value}. Use ${validTargets.join(', ')}.`);
  return value;
}
function helpText() {
  return 'Usage: worktree-governance-audit.js [--json] [--target=<copilot|codex|claude-code>]\n'
    + 'Default audits every sandbox launcher. Target mode audits only one launcher.';
}

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function refs(scope) {
  const out = run(`git for-each-ref --format="%(refname:short)" ${scope}`);
  return out ? out.split('\n').filter(Boolean) : [];
}
function logicalBranchName(branch) { return branch.replace(/^origin\//, ''); }
function filterBranches(branches, target) {
  return target ? branches.filter((branch) => logicalBranchName(branch) === `sandbox/${target}`) : branches;
}

function aheadBehind(branch) {
  const out = run(`git rev-list --left-right --count ${branch}...origin/main`);
  const [ahead, behind] = out.split(/\s+/).map(Number);
  return { ahead, behind };
}
function dirtyInBranch(branch) {
  const out = run('git -c core.quotepath=false status --porcelain --untracked-files=all --branch');
  const lines = out.split('\n').filter(Boolean);
  return (lines[0] || '').includes(`## ${branch}`) ? Math.max(lines.length - 1, 0) : 0;
}

function inspectBranch(branch, usingRemote, issues) {
  const logicalBranch = logicalBranchName(branch);
  if (!sandboxRx.test(logicalBranch)) return issues.push(`${logicalBranch}: invalid sandbox naming.`);
  const { ahead, behind } = aheadBehind(branch);
  if (ahead > 0) issues.push(`${logicalBranch}: ahead of origin/main by ${ahead} commits.`);
  if (behind > maxBehind) issues.push(`${logicalBranch}: behind origin/main by ${behind} commits (max ${maxBehind}).`);
  if (usingRemote) return;
  const dirtyCount = dirtyInBranch(logicalBranch);
  if (dirtyCount > 0) issues.push(`${logicalBranch}: has ${dirtyCount} local changes while on sandbox launcher.`);
}

function checkAllWorktrees(issues) {
  const threshold = Number(process.env.WORKTREE_STALE_BEHIND || 50);
  let raw;
  try { raw = run('git worktree list --porcelain'); } catch { return; }
  const entries = raw.split('\n\n').filter(Boolean);
  // First entry is the main repo worktree. In CI (GitHub Actions PR builds), the
  // main worktree is checked out at a detached HEAD (PR merge ref). Skipping the
  // first entry avoids a true-but-unactionable detached-HEAD finding in CI.
  const additional = entries.slice(1);
  for (const entry of additional) {
    const wpath = (entry.match(/^worktree (.+)/m) || [])[1] || '';
    if (entry.includes('\nlocked')) continue;
    const branch = (entry.match(/^branch refs\/heads\/(.+)/m) || [])[1];
    if (!branch) { issues.push(`${wpath}: detached HEAD — remove or reattach.`); continue; }
    if (sandboxRx.test(branch)) continue;
    try {
      const { behind } = aheadBehind(`refs/heads/${branch}`);
      if (behind > threshold) issues.push(`${branch}: worktree ${behind} commits behind main (max ${threshold}).`);
    } catch { /* branch may be local-only; skip */ }
  }
}

function check(options = {}) {
  const target = Object.hasOwn(options, 'target') ? options.target : parseTarget(options.args);
  run('git fetch origin --prune');
  const localBranches = refs('refs/heads/sandbox/');
  const usingRemote = !localBranches.length;
  const foundBranches = usingRemote ? refs('refs/remotes/origin/sandbox/') : localBranches;
  const branches = filterBranches(foundBranches, target);
  const issues = [];
  if (!branches.length) issues.push(`No ${target ? `sandbox/${target}` : 'sandbox/*'} branches found locally or on origin.`);
  for (const branch of branches) inspectBranch(branch, usingRemote, issues);
  checkAllWorktrees(issues);
  return {
    target: target || 'all',
    checkedBranches: branches.length,
    maxBehind,
    status: issues.length ? 'fail' : 'pass',
    issues,
    runAt: new Date().toISOString(),
  };
}

function printResult(result, asJson) {
  if (asJson) return console.log(JSON.stringify(result, null, 2));
  console.log(`worktree-governance: ${result.status.toUpperCase()} (${result.checkedBranches} branches)`);
  result.issues.forEach((i) => console.log(`- ${i}`));
}

if (require.main === module) {
  const asJson = process.argv.includes('--json');
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(helpText());
    process.exit(0);
  }
  try {
    const result = check();
    printResult(result, asJson);
    process.exit(result.status === 'pass' ? 0 : 1);
  } catch (error) {
    const message = error?.stderr?.toString().trim() || error.message;
    printResult({ status: 'fail', issues: [message], runAt: new Date().toISOString() }, asJson);
    process.exit(1);
  }
}

module.exports = { check, checkAllWorktrees, filterBranches, helpText, parseTarget, validTargets };
