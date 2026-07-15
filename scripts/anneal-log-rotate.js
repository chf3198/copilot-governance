#!/usr/bin/env node
'use strict';
// anneal-log-rotate.js — AC4 (#1133)
// Rotate ~/.megingjord/incidents.jsonl: keep last MAX_LINES lines,
// archive rotated chunks to incidents.<date>.jsonl.bak.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIR = path.join(os.homedir(), '.megingjord');
const INCIDENTS = path.join(DIR, 'incidents.jsonl');
const MAX_LINES = 2000;
const MIN_LINES_TO_ROTATE = 100; // don't rotate tiny files

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

function archivePath(now = new Date()) {
  const stamp = now.toISOString().slice(0, 10);
  return path.join(DIR, `incidents.${stamp}.jsonl.bak`);
}

function rotate(opts = {}) {
  const incidentsFile = opts.incidentsFile || INCIDENTS;
  const maxLines = opts.maxLines || MAX_LINES;
  const dryRun = opts.dryRun || false;

  const lines = readLines(incidentsFile);
  if (lines.length <= maxLines || lines.length < MIN_LINES_TO_ROTATE) {
    return { rotated: false, total: lines.length, kept: lines.length, archived: 0 };
  }

  const archived = lines.slice(0, lines.length - maxLines);
  const kept = lines.slice(lines.length - maxLines);
  const dest = opts.archivePath || archivePath();

  if (!dryRun) {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    // Append archived lines to dated bak file (idempotent on same day)
    fs.appendFileSync(dest, archived.join('\n') + '\n', 'utf8');
    fs.writeFileSync(incidentsFile, kept.join('\n') + '\n', 'utf8');
  }

  return { rotated: true, total: lines.length, kept: kept.length, archived: archived.length, dest };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const result = rotate({ dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (!result.rotated) console.log('anneal-log-rotate: no rotation needed');
  else console.log(`anneal-log-rotate: archived ${result.archived} → ${result.dest}`);
}

module.exports = { rotate, readLines, archivePath, INCIDENTS, MAX_LINES };
