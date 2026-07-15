#!/usr/bin/env node
'use strict';
// split-test-runner.js — runs Playwright specs via npx playwright test
// and node:test specs via node --test, preventing cross-framework
// module-state pollution. Refs #3166.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TESTS = path.join(ROOT, 'tests');

function findSpecs(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { result.push(...findSpecs(full)); continue; }
    if (entry.name.endsWith('.spec.js')) result.push(full);
  }
  return result;
}

function classify(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes('@playwright/test')) return 'playwright';
  return 'node';
}

/** Spawn a child runner, inheriting stdio; returns true on exit 0. */
function spawnRunner(command, args) {
  const proc = spawnSync(command, args, {
    cwd: ROOT, stdio: 'inherit', encoding: 'utf8',
  });
  return proc.status === 0;
}

function run(argv) {
  const verbose = argv.includes('--verbose');
  const nodeOnly = argv.includes('--node-only');
  const pwOnly = argv.includes('--pw-only');
  const passthrough = argv.filter(
    arg => !['--verbose', '--node-only', '--pw-only'].includes(arg)
  );

  const playwrightSpecs = [];
  const nodeSpecs = [];
  for (const file of findSpecs(TESTS)) {
    if (classify(file) === 'playwright') playwrightSpecs.push(file);
    else nodeSpecs.push(file);
  }
  if (verbose) {
    process.stderr.write(
      `[split-runner] ${playwrightSpecs.length} playwright, `
      + `${nodeSpecs.length} node:test\n`);
  }

  let ok = true;
  if (!nodeOnly && playwrightSpecs.length) {
    ok = spawnRunner('npx', ['playwright', 'test', ...passthrough]) && ok;
  }
  if (!pwOnly && nodeSpecs.length) {
    const rel = nodeSpecs.map(file => path.relative(ROOT, file));
    ok = spawnRunner('node', ['--test', ...rel]) && ok;
  }
  return ok;
}

if (require.main === module) {
  const ok = run(process.argv.slice(2));
  process.exit(ok ? 0 : 1);
}

module.exports = { run, findSpecs, classify };
