#!/usr/bin/env node
// log-rotate.js — HAMR Wave 6 child 1 (#941).
// Generic JSONL rotator: caps at N lines; on overflow, gzip-archives + truncates.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DEFAULT_MAX_LINES = 10000;

function countLines(file) {
  if (!fs.existsSync(file)) return 0;
  const data = fs.readFileSync(file, 'utf8');
  if (!data) return 0;
  return data.endsWith('\n') ? data.split('\n').length - 1 : data.split('\n').length;
}

function archive(file) {
  const data = fs.readFileSync(file);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = `${file}.${ts}.gz`;
  fs.writeFileSync(archivePath, zlib.gzipSync(data));
  return archivePath;
}

/** Rotate a JSONL file when its line count exceeds maxLines.
 * Writes gzipped archive at <file>.<iso-ts>.gz then truncates.
 * @param {string} file - Path to JSONL file.
 * @param {object} [opts] - { maxLines }.
 * @returns {{rotated: boolean, lines: number, max: number, archive?: string}} Outcome.
 */
function rotate(file, opts = {}) {
  const max = opts.maxLines ?? DEFAULT_MAX_LINES;
  if (!fs.existsSync(file)) return { rotated: false, lines: 0, max };
  const lines = countLines(file);
  if (lines <= max) return { rotated: false, lines, max };
  const archivePath = archive(file);
  fs.writeFileSync(file, '');
  return { rotated: true, lines, max, archive: archivePath };
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: log-rotate.js <file> [--max-lines=<N>]');
    process.exit(1);
  }
  const flag = process.argv.find((a) => a.startsWith('--max-lines='));
  const maxLines = flag ? parseInt(flag.split('=')[1], 10) : undefined;
  const file = path.resolve(target);
  const result = rotate(file, { maxLines });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

module.exports = { rotate, countLines, DEFAULT_MAX_LINES };
