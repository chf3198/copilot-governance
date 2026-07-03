#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const targetArg = args.find((arg) => arg.startsWith('--target='));
const targetRoot = targetArg ? path.resolve(targetArg.split('=')[1]) : process.cwd();

const assets = [
  ['.prettierrc.json', '.prettierrc.json'],
  ['.prettierignore', '.prettierignore'],
  ['lint-configs/eslint.config.devenv.js', 'lint-configs/eslint.config.devenv.js'],
  ['lint-configs/ruff.devenv.toml', 'lint-configs/ruff.devenv.toml'],
  ['lint-configs/ci-lint.yml', '.github/workflows/ci-lint.yml'],
  ['hooks/scripts/pre-push-readability.sh', 'hooks/scripts/pre-push-readability.sh'],
  ['scripts/install-git-hooks.sh', 'scripts/install-git-hooks.sh'],
];

const timestamp = new Date().toISOString();
const logsDir = path.join(targetRoot, 'scripts', 'logs');
const backupDir = path.join(logsDir, `readability-backup-${timestamp.replace(/[:.]/g, '-')}`);

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

console.log(`Target repo: ${targetRoot}`);
console.log(apply ? 'Mode: APPLY' : 'Mode: DRY-RUN (use --apply to write files)');
if (apply) fs.mkdirSync(backupDir, { recursive: true });

for (const [srcRel, destRel] of assets) {
  const src = path.join(repoRoot, srcRel);
  const dest = path.join(targetRoot, destRel);
  if (!fs.existsSync(src)) continue;
  if (!apply) {
    console.log(`Would install: ${destRel}`);
    continue;
  }
  if (fs.existsSync(dest)) {
    const backup = path.join(backupDir, destRel);
    ensureParent(backup);
    fs.copyFileSync(dest, backup);
  }
  ensureParent(dest);
  fs.copyFileSync(src, dest);
  console.log(`Installed: ${destRel}`);
}

if (apply) console.log(`Backups saved at: ${backupDir}`);
