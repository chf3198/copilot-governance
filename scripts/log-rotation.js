#!/usr/bin/env node
// log-rotation.js — Per-surface retention + rotation for *.jsonl logs.
// Epic #1339 / #1357. Implements R&D Thread 5 retention defaults.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const HOME = process.env.HOME || '/tmp';
const ARCHIVE_DIR = path.join(HOME, '.megingjord', 'archive');
const DEFAULT_SIZE_CAP_BYTES = 50 * 1024 * 1024;  // 50 MB
const DEFAULT_HOT_DAYS = 90;

// Per-surface retention policy. Each entry: { file, hotDays, archive }
const SURFACES = [
  { file: path.join(HOME, '.megingjord', 'incidents.jsonl'), hotDays: 90, archive: true },
  { file: path.join(HOME, '.megingjord', 'cache-stats.jsonl'), hotDays: 30, archive: false },
];

/**
 * @param {string} file
 * @returns {boolean} true if file should be rotated (size cap or date boundary)
 */
function shouldRotate(file, sizeCap = DEFAULT_SIZE_CAP_BYTES) {
  if (!fs.existsSync(file)) return false;
  const stat = fs.statSync(file);
  if (stat.size >= sizeCap) return true;
  // Daily rotation: if mtime is from a prior UTC day
  const today = new Date().toISOString().slice(0, 10);
  const mday = stat.mtime.toISOString().slice(0, 10);
  return mday < today;
}

/**
 * Rotate the file: rename to <file>.YYYY-MM-DD, optionally gzip-archive.
 * @param {string} file
 * @param {boolean} archive  if true, gzip and move to ARCHIVE_DIR
 * @returns {string|null}    path of rotated file (or null if no-op)
 */
function rotate(file, archive = false) {
  if (!fs.existsSync(file)) return null;
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.dirname(file);
  const base = path.basename(file);
  const rotatedPath = path.join(dir, `${base}.${date}`);
  fs.renameSync(file, rotatedPath);
  fs.writeFileSync(file, '');  // recreate empty hot file
  if (!archive) return rotatedPath;
  // Archive: gzip and move
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const surfaceName = base.replace(/\.jsonl$/, '');
  const surfaceDir = path.join(ARCHIVE_DIR, surfaceName);
  if (!fs.existsSync(surfaceDir)) fs.mkdirSync(surfaceDir, { recursive: true });
  const archivedPath = path.join(surfaceDir, `${base}.${date}.gz`);
  const data = fs.readFileSync(rotatedPath);
  fs.writeFileSync(archivedPath, zlib.gzipSync(data));
  fs.unlinkSync(rotatedPath);
  return archivedPath;
}

/**
 * Prune archive entries older than hotDays from now.
 * @param {string} surfaceName  e.g., 'incidents'
 * @param {number} retainDays
 * @returns {number} count of files pruned
 */
function pruneArchive(surfaceName, retainDays) {
  const surfaceDir = path.join(ARCHIVE_DIR, surfaceName);
  if (!fs.existsSync(surfaceDir)) return 0;
  const cutoffMs = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const entry of fs.readdirSync(surfaceDir)) {
    const entryPath = path.join(surfaceDir, entry);
    if (fs.statSync(entryPath).mtimeMs < cutoffMs) {
      fs.unlinkSync(entryPath);
      pruned++;
    }
  }
  return pruned;
}

/**
 * Apply rotation policy to all configured surfaces.
 * @returns {{ rotated: string[], pruned: number }}
 */
function rotateAll(surfaces = SURFACES) {
  const rotated = [];
  let pruned = 0;
  for (const surface of surfaces) {
    if (shouldRotate(surface.file)) {
      const rotatedPath = rotate(surface.file, surface.archive);
      if (rotatedPath) rotated.push(rotatedPath);
    }
    if (surface.archive) {
      const name = path.basename(surface.file).replace(/\.jsonl$/, '');
      pruned += pruneArchive(name, surface.hotDays);
    }
  }
  return { rotated, pruned };
}

if (require.main === module) {
  const result = rotateAll();
  console.log(JSON.stringify(result));
}

module.exports = {
  shouldRotate, rotate, pruneArchive, rotateAll,
  SURFACES, ARCHIVE_DIR, DEFAULT_SIZE_CAP_BYTES, DEFAULT_HOT_DAYS,
};
