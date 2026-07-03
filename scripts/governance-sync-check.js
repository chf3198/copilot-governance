#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { emit } = require('./governance-adapter-emit');

const root = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(root, 'inventory', 'governance-manifest.sample.json');
const trackedRoot = path.join(root, 'generated', 'governance-adapters');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-sync-'));

function relFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else results.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return results.sort();
}

function read(file) { return fs.readFileSync(file, 'utf8'); }

function main() {
  try {
    emit(manifestPath, tempRoot);
    const generated = relFiles(path.join(tempRoot));
    const tracked = relFiles(trackedRoot);
    const all = new Set([...generated, ...tracked]);
    const diffs = [];
    for (const rel of [...all].sort()) {
      const a = path.join(tempRoot, rel);
      const b = path.join(trackedRoot, rel);
      if (!fs.existsSync(a)) diffs.push(`missing generated: ${rel}`);
      else if (!fs.existsSync(b)) diffs.push(`missing tracked: ${rel}`);
      else if (read(a) !== read(b)) diffs.push(`out of date: ${rel}`);
    }
    if (diffs.length) {
      process.stderr.write(`governance-sync-check: stale generated artifacts\n`);
      for (const diff of diffs) process.stderr.write(`- ${diff}\n`);
      process.exit(1);
    }
    process.stdout.write('governance-sync-check: clean\n');
  } catch (e) {
    process.stderr.write(`governance-sync-check: ${e.message}\n`);
    process.exit(2);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) main();
