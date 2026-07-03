#!/usr/bin/env node
// worktree-active-session-lock (#1854) — flock-style session lock. Atomic via
// writeFile→linkSync EEXIST (#1871 concurrency fix). PID + heartbeat liveness.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const LOCK_REL = '.megingjord/active-session.lock';
const STALE_MS = 30 * 60 * 1000;
const DEAD_PID_GRACE_MS = 5 * 60 * 1000;

const lockPath = (rootDir) => path.join(rootDir, LOCK_REL);

function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
const buildLock = (team, ticket, now) => ({ team, ticket, pid: process.pid,
  host: require('node:os').hostname(),
  acquired_at: new Date(now).toISOString(), last_heartbeat: new Date(now).toISOString() });

function readLock(rootDir, opts = {}) {
  const file = lockPath(rootDir);
  if (!fs.existsSync(file)) return null;
  const retries = opts.retries ?? 5;
  for (let i = 0; i <= retries; i++) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      if (text.length === 0) { if (i === retries) return null; continue; }
      return JSON.parse(text);
    } catch { if (i === retries) return null; }
  }
  return null;
}

function isPidLive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function isStale(lock, now = Date.now()) {
  if (!lock) return false;
  const last = Date.parse(lock.last_heartbeat || lock.acquired_at || '');
  if (!Number.isFinite(last)) return true;
  const age = now - last;
  if (age > STALE_MS) return true;
  return !isPidLive(lock.pid) && age > DEAD_PID_GRACE_MS;
}

function tryExclusiveCreate(file, payload) {
  // writeFile→linkSync is atomic on POSIX (single winner via EEXIST)
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  try {
    fs.writeFileSync(tmp, payload, { mode: 0o600 });
    try { fs.linkSync(tmp, file); return true; }
    catch (err) { if (err.code === 'EEXIST') return false; throw err; }
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}

function acquire(rootDir, team, ticket = null, opts = {}) {
  const file = lockPath(rootDir);
  ensureDir(file);
  const now = opts.now ?? Date.now();
  const lock = buildLock(team, ticket, now);
  const payload = JSON.stringify(lock, null, 2);
  if (tryExclusiveCreate(file, payload)) return { ok: true, acquired: true, lock };
  const existing = readLock(rootDir);
  if (existing && !isStale(existing, now)) {
    if (existing.team === team) {
      const refreshed = { ...existing, last_heartbeat: new Date(now).toISOString() };
      fs.writeFileSync(file, JSON.stringify(refreshed, null, 2), 'utf8');
      return { ok: true, refreshed: true, lock: refreshed };
    }
    return { ok: false, reason: 'lock-held-by-other-team', held_by: existing };
  }
  try { fs.unlinkSync(file); } catch {}
  if (tryExclusiveCreate(file, payload)) return { ok: true, acquired: true, lock, replaced_stale: true };
  const winner = readLock(rootDir);
  if (winner && winner.team === team) return { ok: true, refreshed: true, lock: winner };
  return { ok: false, reason: 'lock-held-by-other-team', held_by: winner };
}

function heartbeat(rootDir, team, now = Date.now()) {
  const existing = readLock(rootDir);
  if (!existing || existing.team !== team) return { ok: false, reason: 'no-matching-lock' };
  existing.last_heartbeat = new Date(now).toISOString();
  fs.writeFileSync(lockPath(rootDir), JSON.stringify(existing, null, 2), 'utf8');
  return { ok: true, lock: existing };
}

function release(rootDir, team) {
  const existing = readLock(rootDir);
  if (!existing) return { ok: true, noop: true };
  if (existing.team !== team) return { ok: false, reason: 'lock-not-held-by-this-team', held_by: existing };
  fs.unlinkSync(lockPath(rootDir));
  return { ok: true, released: true };
}

module.exports = { acquire, heartbeat, release, readLock, isStale, isPidLive,
  lockPath, LOCK_REL, STALE_MS, DEAD_PID_GRACE_MS };
