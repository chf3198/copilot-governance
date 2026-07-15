// Tier-C protection: detect Aider/Cline/Roo signatures (#741)
// Exits 0 if workspace is clean OR Tier-C signature is benign
// Exits 1 if a Tier-C auto-commit signature is detected on a protected branch
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROTECTED_BRANCHES = ['main', 'master'];
const PROTECTED_PREFIXES = ['release/', 'hotfix/'];
const GIT_TIMEOUT_MS = 5000;
const COMMIT_MSG_LOOKBACK = 5;

function _git(args) {
  try {
    return execSync(`git ${args}`, {
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
    }).trim();
  } catch { return ''; }
}

function isProtectedBranch(branch) {
  if (!branch) return false;
  if (PROTECTED_BRANCHES.includes(branch)) return true;
  return PROTECTED_PREFIXES.some(prefix => branch.startsWith(prefix));
}

function detectAiderSignature() {
  const log = _git(`log -n ${COMMIT_MSG_LOOKBACK} --format=%B`);
  return /aider:|aider!|aider auto-commit|by aider/i.test(log);
}

function detectClineSignature() {
  if (fs.existsSync(path.join(process.cwd(), '.clinerules'))) return 'cline';
  if (fs.existsSync(path.join(process.cwd(), '.roo'))) return 'roo';
  return null;
}

function status() {
  const branch = _git('rev-parse --abbrev-ref HEAD');
  const aider = detectAiderSignature();
  const cline = detectClineSignature();
  const protectedBr = isProtectedBranch(branch);
  return { branch, aider, cline, protected: protectedBr };
}

function check() {
  const result = status();
  process.stdout.write(`Branch: ${result.branch}\n`);
  if (result.aider) process.stdout.write('  ⚠️  Aider signature detected in recent commit messages\n');
  if (result.cline) process.stdout.write(`  ⚠️  Tier-C tooling detected: ${result.cline}\n`);
  if (!result.aider && !result.cline) {
    process.stdout.write('  ✅ No Tier-C signature detected\n');
    return 0;
  }
  if (result.protected && result.aider) {
    process.stderr.write(`❌ Tier-C auto-commit signature on protected branch (${result.branch})\n`);
    process.stderr.write('   Override: set MEGINGJORD_ALLOW_TIER_C=1 if intentional\n');
    if (process.env.MEGINGJORD_ALLOW_TIER_C === '1') {
      process.stderr.write('   Override active — allowing\n');
      return 0;
    }
    return 1;
  }
  process.stdout.write('  Tier-C tooling allowed on this branch (warning only)\n');
  return 0;
}

module.exports = {
  status, check, detectAiderSignature, detectClineSignature, isProtectedBranch,
  PROTECTED_BRANCHES, PROTECTED_PREFIXES,
};

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'status') {
    process.stdout.write(JSON.stringify(status(), null, 2) + '\n');
    process.exit(0);
  }
  process.exit(check());
}
