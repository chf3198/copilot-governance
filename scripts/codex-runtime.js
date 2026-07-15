#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const MANAGED = path.join(CODEX_HOME, 'devenv-ops');
const AGENTS_HOME = path.join(os.homedir(), '.agents');
const MODE = process.argv[2];
const APPLY = process.argv.includes('--apply');
const DRY = process.argv.includes('--dry-run') || (MODE === 'deploy' && !APPLY);
const START = '# >>> devenv-ops managed block >>>';
const END = '# <<< devenv-ops managed block <<<';
const BLOCK = new RegExp(`${START}[\\s\\S]*?${END}\\n?`, 'm');

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }
function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function wrap(text) { return `${START}\n${text.trim()}\n${END}\n`; }
function log(write, action, label) { console.log(write ? `  ✅ ${label}` : `  Would ${action}: ${label}`); }
function tree(src, dest, write, label, action) {
  console.log(`── ${label} ──`);
  if (write && fs.existsSync(src)) { ensure(path.dirname(dest)); fs.cpSync(src, dest, { recursive: true, force: true }); }
  log(write, action, path.basename(dest)); console.log('');
}
function file(src, dest, write, label, action) {
  console.log(`── ${label} ──`);
  if (write && fs.existsSync(src)) { ensure(path.dirname(dest)); fs.copyFileSync(src, dest); }
  log(write, action, path.basename(dest)); console.log('');
}
function mergeManaged(src, dest, write) {
  console.log(`── ${path.basename(dest)} ──`);
  const current = read(dest), managed = wrap(read(src));
  const merged = BLOCK.test(current) ? current.replace(BLOCK, managed) :
    `${current.trim()}${current.trim() ? '\n\n' : ''}${managed}`;
  if (write) { ensure(path.dirname(dest)); fs.writeFileSync(dest, merged); }
  log(write, 'merge', path.basename(dest)); console.log('');
}
function extractManaged(src, dest, write) {
  console.log(`── ${path.basename(src)} ──`);
  const match = read(src).match(new RegExp(`${START}\\n([\\s\\S]*?)\\n${END}`));
  if (write && match) { ensure(path.dirname(dest)); fs.writeFileSync(dest, `${match[1].trim()}\n`); }
  console.log(match ? `  ${write ? '✅' : 'Would extract:'} ${path.basename(dest)}` : '  Missing managed block'); console.log('');
}
function initScope(write) {
  const dest = path.join(MANAGED, 'repo-scope.json');
  console.log('── repo-scope.json ──');
  if (write && !fs.existsSync(dest)) { ensure(path.dirname(dest)); fs.writeFileSync(dest, '{\n  "default_enabled": true,\n  "enabled_repos": []\n}\n'); }
  log(write, fs.existsSync(dest) ? 'preserve' : 'create', 'repo-scope.json'); console.log('');
}

if (!['deploy', 'sync'].includes(MODE)) {
  console.error('Usage: codex-runtime.js <deploy|sync> [--apply|--dry-run]'); process.exit(1);
}

console.log(`${MODE === 'deploy' ? 'Source' : 'Syncing from'}: ${MODE === 'deploy' ? ROOT : CODEX_HOME}`);
console.log(`${MODE === 'deploy' ? 'Target' : 'Into'}: ${MODE === 'deploy' ? CODEX_HOME : ROOT}\n`);
if (DRY) console.log(`=== ${MODE === 'deploy' ? 'DRY RUN (pass --apply to write Codex runtime)' : 'DRY RUN — no Codex changes will be made'} ===\n`);
if (MODE === 'deploy') {
  tree(path.join(ROOT, 'skills'), path.join(AGENTS_HOME, 'skills'), !DRY, 'Codex User Skills', 'deploy');
  tree(path.join(ROOT, 'scripts', 'global'), path.join(MANAGED, 'scripts'), !DRY, 'Codex Managed Scripts', 'deploy');
  tree(path.join(ROOT, 'hooks', 'scripts'), path.join(MANAGED, 'hooks'), !DRY, 'Codex Managed Hooks', 'deploy');
  tree(path.join(ROOT, 'wiki'), path.join(MANAGED, 'wiki'), !DRY, 'Codex Managed Wiki', 'deploy');
  tree(path.join(ROOT, '.codex', 'runtime-rules'), path.join(CODEX_HOME, 'rules'), !DRY, 'Codex Rules', 'deploy');
  mergeManaged(path.join(ROOT, '.codex', 'AGENTS.md'), path.join(CODEX_HOME, 'AGENTS.md'), !DRY);
  mergeManaged(path.join(ROOT, '.codex', 'runtime.config.toml'), path.join(CODEX_HOME, 'config.toml'), !DRY);
  file(path.join(ROOT, '.codex', 'runtime-hooks.json'), path.join(CODEX_HOME, 'hooks.json'), !DRY, 'Codex Hooks', 'deploy');
  initScope(!DRY);
} else {
  tree(path.join(AGENTS_HOME, 'skills'), path.join(ROOT, 'skills'), !DRY, 'Codex User Skills', 'sync');
  tree(path.join(MANAGED, 'scripts'), path.join(ROOT, 'scripts', 'global'), !DRY, 'Codex Managed Scripts', 'sync');
  tree(path.join(MANAGED, 'hooks'), path.join(ROOT, 'hooks', 'scripts'), !DRY, 'Codex Managed Hooks', 'sync');
  tree(path.join(MANAGED, 'wiki'), path.join(ROOT, 'wiki'), !DRY, 'Codex Managed Wiki', 'sync');
  tree(path.join(CODEX_HOME, 'rules'), path.join(ROOT, '.codex', 'runtime-rules'), !DRY, 'Codex Rules', 'sync');
  extractManaged(path.join(CODEX_HOME, 'AGENTS.md'), path.join(ROOT, '.codex', 'AGENTS.md'), !DRY);
  extractManaged(path.join(CODEX_HOME, 'config.toml'), path.join(ROOT, '.codex', 'runtime.config.toml'), !DRY);
  file(path.join(CODEX_HOME, 'hooks.json'), path.join(ROOT, '.codex', 'runtime-hooks.json'), !DRY, 'Codex Hooks', 'extract');
}
