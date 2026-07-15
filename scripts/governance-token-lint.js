#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const catalogPath = path.join(root, 'instructions/governance-controls.instructions.md');
const scanRoots = ['instructions', 'scripts', '.github/workflows'];
const extOk = new Set(['.md', '.js', '.yml', '.yaml', '.json']);
const ignore = ['node_modules', '.git', '.dashboard', 'logs', 'test-results', 'playwright-report'];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.includes(entry.name)) continue;
    const targetPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(targetPath, out);
    else if (extOk.has(path.extname(entry.name))) out.push(targetPath);
  }
  return out;
}

function tokens(text) {
  return [...new Set((text.match(/\bGOV-\d{3}\b/g) || []))];
}

function getCatalogTokens() {
  const text = fs.readFileSync(catalogPath, 'utf8');
  return tokens(text);
}

function main() {
  const known = new Set(getCatalogTokens());
  const files = scanRoots.flatMap(d => walk(path.join(root, d))).filter(f => f !== catalogPath);
  const unresolved = [];
  for (const filePath of files) {
    const rel = path.relative(root, filePath);
    const found = tokens(fs.readFileSync(filePath, 'utf8'));
    for (const token of found) {
      if (!known.has(token)) unresolved.push(`${rel}: ${token}`);
    }
  }
  if (unresolved.length) {
    console.error('❌ Unresolved governance tokens:');
    for (const row of unresolved) console.error(`  - ${row}`);
    process.exit(1);
  }
  console.log(`✅ governance-token-lint: all GOV-* tokens resolve (${[...known].join(', ')})`);
}

if (require.main === module) main();

module.exports = { tokens };
