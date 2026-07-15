#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = path.join(os.homedir(), '.megingjord', 'dispatch-cache.jsonl');
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

function ensureDir() { fs.mkdirSync(path.dirname(FILE), { recursive: true }); }

function keyFromRequest(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
}

function readEntries(file = FILE) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function getCached(key, opts = {}) {
  const now = opts.now ?? Date.now();
  const ttlMs = opts.ttlMs ?? TTL_MS;
  const rows = readEntries(opts.file).filter(row => now - Number(row.ts || 0) <= ttlMs);
  for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i].key === key) return rows[i];
  return null;
}

function putCached(key, value, opts = {}) {
  ensureDir();
  const rows = readEntries(opts.file);
  const next = [...rows.slice(-(MAX_ENTRIES - 1)), { ts: Date.now(), key, value }];
  fs.writeFileSync(opts.file || FILE, next.map(JSON.stringify).join('\n') + '\n');
}

module.exports = { FILE, TTL_MS, MAX_ENTRIES, keyFromRequest, readEntries, getCached, putCached };
