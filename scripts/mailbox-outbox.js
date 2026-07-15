#!/usr/bin/env node
// mailbox-outbox.js — local SQLite WAL outbox for HAMR mailbox (#918).
// Per v3.2 §4 failover map: queue outbound when Worker unreachable; flush on next poll.
// Substitutes a JSONL append-file when better-sqlite3 isn't installed (zero-dependency fallback).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const OUTBOX_DIR = path.join(os.homedir(), '.megingjord');
const OUTBOX_FILE = path.join(OUTBOX_DIR, 'mailbox-outbox.jsonl');
const MIN_TTL_MS = 60_000;
const HTTP_OK = 200;

function ensureDir() {
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
}

function appendOutbound(envelope, meta = {}) {
  ensureDir();
  const line = JSON.stringify({ envelope, meta, queued_at: new Date().toISOString(), status: 'pending' }) + '\n';
  fs.appendFileSync(OUTBOX_FILE, line);
  return { queued: true, file: OUTBOX_FILE };
}

function readPending() {
  if (!fs.existsSync(OUTBOX_FILE)) return [];
  const text = fs.readFileSync(OUTBOX_FILE, 'utf8');
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.status === 'pending') out.push(entry);
    } catch { /* skip */ }
  }
  return out;
}

function markFlushed(nonce) {
  if (!fs.existsSync(OUTBOX_FILE)) return false;
  const text = fs.readFileSync(OUTBOX_FILE, 'utf8');
  const lines = text.split('\n').filter((l) => l.trim());
  const updated = lines.map((line) => {
    try {
      const entry = JSON.parse(line);
      if (entry.envelope?.headers?.nonce === nonce && entry.status === 'pending') {
        entry.status = 'flushed';
        entry.flushed_at = new Date().toISOString();
      }
      return JSON.stringify(entry);
    } catch { return line; }
  });
  fs.writeFileSync(OUTBOX_FILE, updated.join('\n') + '\n');
  return true;
}

async function flushPending(client) {
  const pending = readPending();
  const results = [];
  for (const entry of pending) {
    try {
      const send = await client.sendMessage({
        recipient: entry.envelope.headers.recipient_key_id ?? entry.envelope.headers.recipient,
        body: entry.envelope.body,
        ttlMs: Math.max(MIN_TTL_MS, Date.parse(entry.envelope.headers.expires_at) - Date.now()),
      });
      if (send.status === HTTP_OK) markFlushed(entry.envelope.headers.nonce);
      results.push({ nonce: entry.envelope.headers.nonce, status: send.status });
    } catch (e) {
      results.push({ nonce: entry.envelope.headers.nonce, error: e.message });
    }
  }
  return { flushed: results.filter((entry) => entry.status === HTTP_OK).length, total: pending.length, results };
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'list') console.log(JSON.stringify(readPending(), null, 2));
  else if (cmd === 'flush') {
    const client = require('./mailbox-client');
    flushPending(client).then((r) => console.log(JSON.stringify(r, null, 2)));
  } else console.error('usage: mailbox-outbox.js <list|flush>');
}

module.exports = { appendOutbound, readPending, markFlushed, flushPending, OUTBOX_FILE };
