#!/usr/bin/env node
'use strict';
// tier: 1
// governance-outbox (Epic #2709 / #2724): offline fail-closed + auto-queue
// durability for governance-chain links. When a link record cannot reach GitHub,
// it is appended to a local append-only outbox; a leased reconciler flushes it on
// reconnect. "Exactly-once" = at-least-once + idempotent consumer (content-hash
// key + skip-if-already-present). Append-only (state markers, never delete) for audit.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

function canonicalizeGovText(text) {
  return String(text == null ? '' : text)
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function idempotencyKey(event) {
  return crypto.createHash('sha256').update(canonicalJson(event)).digest('hex');
}

function readEntries(outboxPath) {
  if (!fs.existsSync(outboxPath)) return [];
  return fs.readFileSync(outboxPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function enqueue(event, opts = {}) {
  const outboxPath = opts.outboxPath || defaultPath();
  const key = idempotencyKey(event);
  fs.mkdirSync(path.dirname(outboxPath), { recursive: true });
  fs.appendFileSync(outboxPath, JSON.stringify({ key, state: 'queued', event }) + '\n');
  return key;
}

function acquireLease(lockPath) {
  try { return fs.openSync(lockPath, 'wx'); } catch (err) { return null; }
}

function flush(opts = {}) {
  const outboxPath = opts.outboxPath || defaultPath();
  const lockPath = outboxPath + '.lock';
  const remoteHas = opts.remoteHas || (() => false);
  const remotePut = opts.remotePut || (() => {});
  const lease = acquireLease(lockPath);
  if (lease === null) return { flushed: 0, skipped: 0, locked: true };
  try {
    const entries = readEntries(outboxPath);
    const done = new Set(entries.filter((entry) => entry.state === 'flushed').map((entry) => entry.key));
    let flushed = 0;
    let skipped = 0;
    for (const entry of entries.filter((entry) => entry.state === 'queued')) {
      if (done.has(entry.key)) { skipped += 1; continue; }
      if (!remoteHas(entry.key)) remotePut(entry.event, entry.key);
      fs.appendFileSync(outboxPath, JSON.stringify({ key: entry.key, state: 'flushed' }) + '\n');
      done.add(entry.key);
      flushed += 1;
    }
    return { flushed, skipped, locked: false };
  } finally {
    fs.closeSync(lease);
    fs.rmSync(lockPath, { force: true });
  }
}

function defaultPath() {
  return path.join(process.env.HOME || '.', '.megingjord', 'governance-outbox.jsonl');
}

module.exports = { canonicalJson, canonicalizeGovText, idempotencyKey, readEntries,
  enqueue, flush, acquireLease, defaultPath };
