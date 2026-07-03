'use strict';
// Operator-safe branch cleanup policy (dry-run only). Refs #1610 #2048.
// Sandbox/ launchers and active leases are never flagged (three-team safety).
const { execSync, spawnSync } = require('child_process');
const leaseRegistry = require('./cross-team-lease-registry');

// Conservative branch-name allowlist — git permits broader names, but the cleanup
// planner only ever acts on Conventional-Commit-shaped branches plus sandbox/launcher
// prefixes. Anything outside this set is treated as untrusted input and routed to
// keep-active (safe classification). Refs #2048 (shell-injection defense).
const SAFE_BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9/_.@-]*$/;
const SAFE_BRANCH_MAX_LEN = 200;

function isSafeBranchName(name) {
  return typeof name === 'string'
    && name.length > 0
    && name.length <= SAFE_BRANCH_MAX_LEN
    && SAFE_BRANCH_RE.test(name);
}

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function localBranches() {
  return sh('git branch -l').split('\n')
    .map(b => b.trim().replace(/^\*\s*/, ''))
    .filter(b => b && b !== 'main');
}

// Default-branch resolution fallback chain (Refs #2049):
// 1. overrides.env.DEFAULT_BRANCH (test injection) or process.env.DEFAULT_BRANCH (live)
// 2. git symbolic-ref refs/remotes/origin/HEAD --short  (auto-detection)
// 3. 'origin/main'  (hardcoded last-resort fallback)
function resolveDefaultBranch(overrides = {}) {
  const env = overrides.env !== undefined ? overrides.env : process.env;
  if (env.DEFAULT_BRANCH) return `origin/${env.DEFAULT_BRANCH}`;
  const shFn = overrides.sh !== undefined ? overrides.sh : sh;
  const detected = shFn('git symbolic-ref refs/remotes/origin/HEAD --short');
  if (detected) return detected;
  return 'origin/main';
}

function isMergedToMain(branch, overrides = {}) {
  if (!isSafeBranchName(branch)) return false;
  const defaultBranch = overrides.defaultBranch || resolveDefaultBranch(overrides);
  const res = spawnSync('git', ['merge-base', '--is-ancestor', `refs/heads/${branch}`, defaultBranch],
    { stdio: ['pipe', 'pipe', 'pipe'] });
  return res.status === 0;
}

function prState(branch) {
  if (!isSafeBranchName(branch)) return null;
  const res = spawnSync('gh',
    ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state', '--jq', '.[0]'],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (res.status !== 0) return null;
  const raw = (res.stdout || '').trim();
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function orphanedLeases(branches, registryFn) {
  const readFn = registryFn || leaseRegistry.read;
  try {
    const reg = readFn(leaseRegistry.DEFAULT_PATH);
    const leases = leaseRegistry.active(reg).filter(l => l.branch && !branches.includes(l.branch));
    return { leases, error: null };
  } catch (err) {
    process.stderr.write(`[branch-cleanup-plan] lease registry unavailable (${leaseRegistry.DEFAULT_PATH}): ${err.message}\n`);
    return { leases: [], error: err.message };
  }
}

function classify(branch, merged, pr) {
  if (branch.startsWith('sandbox/')) return { state: 'keep-launcher', evidence: 'sandbox launcher' };
  if (merged && pr && pr.state === 'MERGED') return { state: 'merged-clean', evidence: `merged to main; PR #${pr.number} MERGED` };
  if (merged && !pr) return { state: 'merged-no-pr', evidence: 'merged to main; no PR found' };
  if (pr && pr.state === 'CLOSED') return { state: 'closed-pr', evidence: `PR #${pr.number} is CLOSED` };
  if (merged && pr && pr.state === 'OPEN') return { state: 'merged-open-pr', evidence: `merged to main; PR #${pr.number} still OPEN` };
  return { state: 'keep-active', evidence: 'not merged or has active PR' };
}

function commandsFor(branch, state) {
  // Output commands are presented to operator review (dry-run plan), not executed
  // automatically. Single-quote branch names so any shell metacharacter that leaked
  // through earlier classification is inert when the operator pastes the command.
  // Defense-in-depth pairs with the SAFE_BRANCH_RE allowlist at the call sites of
  // isMergedToMain + prState. Refs #2048.
  const q = `'${String(branch).replace(/'/g, "'\\''")}'`;
  if (state === 'merged-clean' || state === 'merged-no-pr')
    return [`git branch -d ${q}`, `git push origin --delete ${q} || true`];
  if (state === 'closed-pr') return [`git branch -d ${q}`];
  return [];
}

function plan(overrides = {}) {
  const branches = overrides.branches || localBranches();
  const getIsMerged = overrides.isMergedToMain || isMergedToMain;
  const getPr = overrides.prState || prState;
  const leaseResult = overrides.leases !== undefined
    ? { leases: overrides.leases, error: null }
    : orphanedLeases(branches, overrides.leaseRegistryReader);
  const entries = branches.map(branch => {
    const { state, evidence } = classify(branch, getIsMerged(branch), getPr(branch));
    return { branch, cleanupState: state, evidence, commands: commandsFor(branch, state) };
  });
  const report = {
    generatedAt: new Date().toISOString(), mode: 'dry-run',
    branches: entries,
    orphanedLeases: leaseResult.leases.map(l => ({ ticket: l.ticket, branch: l.branch, action: 'lease-close' })),
  };
  if (leaseResult.error) report.registryError = leaseResult.error;
  return report;
}

function run(argv = process.argv.slice(2)) {
  const report = plan();
  if (argv.includes('--json')) { process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); return report; }
  console.log(`\nBranch Cleanup Plan (dry-run) — ${report.generatedAt}\n`);
  for (const entry of report.branches) {
    if (entry.cleanupState === 'keep-active' || entry.cleanupState === 'keep-launcher') continue;
    console.log(`  [${entry.cleanupState}] ${entry.branch}`);
    console.log(`    evidence: ${entry.evidence}`);
    for (const cmd of entry.commands) console.log(`    > ${cmd}`);
  }
  if (report.orphanedLeases.length) {
    console.log('\nOrphaned leases (branch deleted, lease not closed):');
    for (const lease of report.orphanedLeases) console.log(`  ticket #${lease.ticket}: ${lease.branch}`);
  }
  if (report.registryError) {
    console.log(`\n[warn] Orphaned lease list may be incomplete — registry unavailable: ${report.registryError}`);
  }
  return report;
}

if (require.main === module) run();
module.exports = { classify, commandsFor, plan, isSafeBranchName, isMergedToMain, prState, resolveDefaultBranch };
