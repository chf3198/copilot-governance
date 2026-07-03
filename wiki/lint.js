#!/usr/bin/env node
// Lint — enforce ≤100 lines per file
// Usage: node scripts/lint.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIMIT = 100;

const IGNORE = [
  'node_modules', '.git', 'playwright-report',
  'test-results', 'package-lock.json', '.dashboard',
  'logs',
  // Global resources have their own governance
  'skills', 'hooks'
];

const IGNORE_PATHS = ['scripts/global', 'instructions', 'research', 'docs/howto'];
const IGNORE_FILES = [
  'CHANGELOG.md', 'CHANGELOG-archive.md',
  // Append-only / catalog files that grow by design
  'log.md', 'index.md',
];

const EXTS = ['.js', '.html', '.css', '.md', '.sh', '.json'];

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.includes(entry.name)) continue;
    if (IGNORE_FILES.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (IGNORE_PATHS.some(p => rel.startsWith(p))) continue;
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (EXTS.includes(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

let violations = 0;
let total = 0;

for (const file of walk(ROOT)) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length;
  const rel = path.relative(ROOT, file);
  total++;
  if (lines > LIMIT) {
    console.error(`❌ ${rel}: ${lines} lines (limit ${LIMIT})`);
    violations++;
  }
}

console.log(`\nScanned ${total} files.`);
if (violations > 0) {
  console.error(`${violations} file(s) exceed ${LIMIT}-line limit.`);
  process.exit(1);
} else {
  console.log(`✅ All files within ${LIMIT}-line limit.`);
}
