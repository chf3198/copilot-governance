'use strict';
// split-test-runner-ignore.js — generates the testIgnore list for
// playwright.config.js so Playwright only collects @playwright/test
// specs. node:test specs (and bare-assert scripts) are run by
// split-test-runner.js via `node --test`. Refs #3166.

const fs = require('fs');
const path = require('path');

const TESTS = path.resolve(__dirname, '..', '..', 'tests');

function findSpecs(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { result.push(...findSpecs(full)); continue; }
    if (entry.name.endsWith('.spec.js')) result.push(full);
  }
  return result;
}

function isPlaywrightSpec(file) {
  const src = fs.readFileSync(file, 'utf8');
  return src.includes('@playwright/test');
}

/** Returns relative paths (from tests/) of non-Playwright specs. */
function nodeTestIgnoreList() {
  return findSpecs(TESTS)
    .filter(file => !isPlaywrightSpec(file))
    .map(file => path.relative(TESTS, file));
}

module.exports = { nodeTestIgnoreList, isPlaywrightSpec };
