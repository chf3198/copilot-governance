#!/usr/bin/env node
'use strict';
// memory-dedup-lint.js (#3128, Epic #3124 D4): flag a pattern_id / normalized title appearing in 2+
// canonical surfaces (the duplication that causes drift). Deterministic exact/normalized hashing; no
// embeddings (deferred per D5). Local, $0. Advisory by default; --strict opts into a non-zero exit.
const fs = require('fs');

const KEY_MAX_CHARS = 60; // normalized dedup-key length

/** Normalize a title/hook/id to a dedup key (lowercase alnum, bounded).
 * @param {string} text raw text. @returns {string} normalized key. */
function normalizeKey(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, KEY_MAX_CHARS);
}

/** Extract dedup keys from one markdown/jsonl surface (pattern_id refs + index bullet titles).
 * @param {string} file path. @returns {string[]} keys (absent file -> []). */
function keysFromSurface(file) {
  if (!fs.existsSync(file)) return [];
  const keys = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const patternMatch = line.match(/pattern_id["':\s]+([a-z0-9-]{6,})/i);
    if (patternMatch) keys.push(normalizeKey(patternMatch[1]));
    const bulletMatch = line.match(/^- \[([^\]]+)\]/);
    if (bulletMatch) keys.push(normalizeKey(bulletMatch[1]));
  }
  return keys;
}

/** Find dedup keys present in 2+ surfaces.
 * @param {string[]} surfaces file paths. @returns {object[]} [{key, homes}]. */
function findDuplicates(surfaces) {
  const seen = new Map();
  for (const surface of surfaces) {
    for (const key of new Set(keysFromSurface(surface))) {
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(surface);
    }
  }
  return [...seen.entries()]
    .filter(([, homes]) => homes.length > 1)
    .map(([key, homes]) => ({ key, homes }));
}

/** Markdown bullet lines in a file that exceed a pointer budget (for learnings.md projection).
 * @param {string} file path. @param {number} maxChars budget. @returns {string[]} over-budget previews. */
function longEntries(file, maxChars) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('- ') && line.length > maxChars)
    .map((line) => `${line.length}c: ${line.slice(0, KEY_MAX_CHARS)}...`);
}

function main() {
  const argv = process.argv.slice(2);
  const surfaces = argv.filter((arg) => !arg.startsWith('--'));
  const dups = findDuplicates(surfaces);
  process.stdout.write(
    `memory-dedup-lint: ${dups.length} duplicate key(s) across ${surfaces.length} surfaces\n`
  );
  for (const dup of dups) process.stdout.write(`  "${dup.key}" in: ${dup.homes.join(', ')}\n`);
  if (argv.includes('--strict') && dups.length) process.exit(1);
}

if (require.main === module) main();
module.exports = { normalizeKey, keysFromSurface, findDuplicates, longEntries };
