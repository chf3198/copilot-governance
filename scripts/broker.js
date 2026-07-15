#!/usr/bin/env node
// scripts/global/broker.js — Megingjord Agent Broker (Epic #1083 Wave-1).
// Decision C + A failover: SQLite-backed local broker; HAMR /teams reconciler best-effort.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const DB_DIR = path.join(process.env.HOME, '.megingjord');
const DB_FILE = path.join(DB_DIR, 'broker.json');
const WORKTREE_DIR = path.join(DB_DIR, 'worktrees');
const QUARANTINE_DIR = path.join(DB_DIR, 'quarantine');
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const HEARTBEAT_TTL_MS = 5 * 60 * 1000;

function loadDb() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) return { leases: [], file_leases: [], quarantine: [] };
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function newId() { return crypto.randomBytes(8).toString('hex'); }

function isExpired(lease, nowMs = Date.now()) {
  const last = Date.parse(lease.last_heartbeat || lease.acquired_at);
  return nowMs - last > lease.ttl_ms;
}

function activeLease(db, ticket) {
  return db.leases.find(l => l.ticket_id === ticket && l.status === 'active' && !isExpired(l));
}

function acquire(opts) {
  const db = loadDb();
  const existing = activeLease(db, opts.ticket);
  if (existing && existing.session_id !== opts.session_id) {
    return { ok: false, reason: 'lease-held', existing };
  }
  const lease = {
    lease_id: newId(),
    ticket_id: opts.ticket,
    branch: opts.branch || `feat/${opts.ticket}-${(opts.slug || 'work').slice(0, 32)}`,
    agent: opts.agent || 'unknown',
    model: opts.model || 'unknown',
    session_id: opts.session_id || newId(),
    acquired_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
    ttl_ms: opts.ttl_ms || DEFAULT_TTL_MS,
    status: 'active',
    files: opts.files || [],
  };
  db.leases.push(lease);
  saveDb(db);
  fs.mkdirSync(WORKTREE_DIR, { recursive: true });
  return { ok: true, lease, worktree_dir: path.join(WORKTREE_DIR, lease.lease_id) };
}

function heartbeat(leaseId) {
  const db = loadDb();
  const lease = db.leases.find(l => l.lease_id === leaseId);
  if (!lease) return { ok: false, reason: 'not-found' };
  lease.last_heartbeat = new Date().toISOString();
  saveDb(db);
  return { ok: true, lease };
}

function release(leaseId, opts = {}) {
  const db = loadDb();
  const lease = db.leases.find(l => l.lease_id === leaseId);
  if (!lease) return { ok: false, reason: 'not-found' };
  lease.status = opts.quarantine ? 'quarantined' : 'released';
  lease.released_at = new Date().toISOString();
  saveDb(db);
  return { ok: true, lease };
}

function status(opts = {}) {
  const db = loadDb();
  const now = Date.now();
  return db.leases.filter(l => {
    if (opts.ticket && l.ticket_id !== opts.ticket) return false;
    if (opts.activeOnly && (l.status !== 'active' || isExpired(l, now))) return false;
    return true;
  });
}

function reconcile() {
  const db = loadDb();
  const now = Date.now();
  let expiredCount = 0;
  for (const lease of db.leases) {
    if (lease.status === 'active' && isExpired(lease, now)) {
      lease.status = 'stale';
      expiredCount++;
    }
  }
  saveDb(db);
  return { ok: true, expired: expiredCount, total: db.leases.length };
}

if (require.main === module) {
  const cmd = process.argv[2];
  const args = Object.fromEntries(process.argv.slice(3).reduce((acc, arg, i, arr) => {
    if (arg.startsWith('--')) acc.push([arg.slice(2), arr[i + 1]]); return acc;
  }, []));
  if (cmd === 'acquire') console.log(JSON.stringify(acquire({
    ticket: parseInt(args.ticket), agent: args.agent, model: args.model,
    slug: args.slug, files: (args.files || '').split(',').filter(Boolean),
  }), null, 2));
  else if (cmd === 'heartbeat') console.log(JSON.stringify(heartbeat(args.lease), null, 2));
  else if (cmd === 'release') console.log(JSON.stringify(release(args.lease, { quarantine: args.quarantine === 'true' }), null, 2));
  else if (cmd === 'status') console.log(JSON.stringify(status({ ticket: args.ticket ? parseInt(args.ticket) : null, activeOnly: args.active === 'true' }), null, 2));
  else if (cmd === 'reconcile') console.log(JSON.stringify(reconcile(), null, 2));
  else console.log('Usage: broker.js [acquire|heartbeat|release|status|reconcile] --ticket N --agent NAME ...');
}

module.exports = { acquire, heartbeat, release, status, reconcile, loadDb, saveDb,
  isExpired, activeLease, DB_FILE, WORKTREE_DIR, DEFAULT_TTL_MS, HEARTBEAT_TTL_MS };
