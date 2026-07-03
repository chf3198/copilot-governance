#!/usr/bin/env node
'use strict';
// doc-plane-boundary-lint.js (#3129, Epic #3124 D1): enforce the two-plane boundary. (a) FRESHNESS —
// a compiled wiki entry's source_sha256 must match its live source doc (else STALE -> recompile).
// (b) RESIDENT-PRELOAD guard — flag a docs/** path @-imported into CLAUDE.md / instructions/ (agents
// read compiled entries, never raw docs in resident context). Deterministic, local, $0. Advisory;
// --strict opts into a non-zero exit.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..', '..');

/** sha256 hex of text. @param {string} text @returns {string} hex digest. */
function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Compiled entries whose source_sha256 no longer matches the live source doc.
 * @param {string} dir compiled-entry directory. @returns {string[]} stale descriptions. */
function staleEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  const stale = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    const sourceMatch = text.match(/source_path:\s*"?([^"\n]+)"?/);
    const shaMatch = text.match(/source_sha256:\s*([0-9a-f]{64})/);
    if (!sourceMatch || !shaMatch) continue;
    const sourcePath = path.join(root, sourceMatch[1].trim());
    if (
      fs.existsSync(sourcePath) &&
      sha256Hex(fs.readFileSync(sourcePath, 'utf8')) !== shaMatch[1]
    ) {
      stale.push(`${name} stale vs ${sourceMatch[1].trim()}`);
    }
  }
  return stale;
}

/** Resident files (CLAUDE.md + instructions/*.md) that @-import a docs/** path. @returns {string[]} hits. */
function residentDocPreloads() {
  const files = [path.join(root, 'CLAUDE.md')];
  const instructionsDir = path.join(root, 'instructions');
  if (fs.existsSync(instructionsDir)) {
    for (const name of fs.readdirSync(instructionsDir))
      if (name.endsWith('.md')) files.push(path.join(instructionsDir, name));
  }
  const hits = [];
  for (const file of files.filter((candidate) => fs.existsSync(candidate))) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (/^@docs\//.test(line.trim())) hits.push(`${path.relative(root, file)}: ${line.trim()}`);
    }
  }
  return hits;
}

function main() {
  const argv = process.argv.slice(2);
  const dirIndex = argv.indexOf('--dir');
  const dir = dirIndex !== -1 ? argv[dirIndex + 1] : path.join(root, 'wiki/code/concepts');
  const stale = staleEntries(dir);
  const preloads = residentDocPreloads();
  process.stdout.write(
    `doc-plane-boundary-lint: ${stale.length} stale entr(ies), ${preloads.length} resident doc-preload(s)\n`
  );
  for (const item of stale) process.stdout.write(`  STALE: ${item}\n`);
  for (const item of preloads) process.stdout.write(`  PRELOAD: ${item}\n`);
  if (argv.includes('--strict') && (stale.length || preloads.length)) process.exit(1);
}

if (require.main === module) main();
module.exports = { staleEntries, residentDocPreloads, sha256Hex };
