#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const RULES_FILE = path.join(ROOT, 'inventory', 'operator-ownership-rules.json');

/**
 * Load centralized operator-ownership assertions.
 * @returns {{scopedFiles:string[], assertions:{id:string,description:string,patterns:string[]}[]}}
 */
function loadRules() {
  return JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
}

/**
 * Normalize text for resilient phrase matching.
 * @param {string} input raw file content or phrase text.
 * @returns {string} normalized lowercase string with obfuscation chars removed.
 */
function normalize(input) {
  return input
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u2060\uFE00-\uFE0F]/g, '')
    .toLowerCase();
}

/**
 * Evaluate the file-by-assertion matrix and return mismatches.
 * @param {string} root repository root path.
 * @returns {{ok:boolean, failed:{file:string,assertion:string,passed:boolean,detail:string}[], rows:{file:string,assertion:string,passed:boolean,detail:string}[]}}
 */
function runMatrix(root = ROOT) {
  const rules = loadRules();
  const rows = [];
  for (const rel of rules.scopedFiles) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) {
      rows.push({ file: rel, assertion: 'file-exists', passed: false, detail: 'missing file' });
      continue;
    }
    const text = normalize(fs.readFileSync(full, 'utf8'));
    for (const assertion of rules.assertions) {
      const hits = assertion.patterns.filter(p => text.includes(normalize(p)));
      rows.push({
        file: rel,
        assertion: assertion.id,
        passed: hits.length > 0,
        detail: hits.length ? `matched: ${hits[0]}` : `missing any of: ${assertion.patterns.join(', ')}`,
      });
    }
  }
  const failed = rows.filter(r => !r.passed);
  return { ok: failed.length === 0, failed, rows };
}

module.exports = { loadRules, normalize, runMatrix, RULES_FILE };

if (require.main === module) {
  const result = runMatrix();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}
