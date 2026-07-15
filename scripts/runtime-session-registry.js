#!/usr/bin/env node
'use strict';
// tier: 0
// runtime-session-registry (#2667; closes the #2658+#2659 attribution arc): records each
// active agent runtime's session so the canonical-main-wip-guard can NAME which foreign
// runtime stranded WIP — instead of guessing.
//
// Concurrency-safe by construction: each session owns ONE file (`<session_id>.json`) written
// atomically (temp+rename), so concurrent registrations from different runtimes never race on
// a shared file. Self-cleaning: a session counts as active only while its pid is alive AND its
// TTL has not lapsed; dead/expired files are pruned on read — no SessionEnd hook required.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REG_DIR = path.join(os.homedir(), '.megingjord', 'runtime-sessions');
const TTL_MS = 12 * 3600 * 1000; // 12h heartbeat ceiling

function sessionFile(dir, sessionId) {
  return path.join(dir, `${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
}

// EPERM = process exists but isn't ours (still alive); ESRCH = no such process.
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

function registerSession(runtime, opts = {}) {
  const dir = opts.dir || REG_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const pid = opts.pid || process.pid;
  const sessionId = opts.sessionId || process.env.CLAUDE_CODE_SESSION_ID || String(pid);
  const nowMs = opts.now || Date.now();
  const entry = {
    runtime, session_id: sessionId, cwd: opts.cwd || process.cwd(), pid,
    ts: opts.ts || new Date(nowMs).toISOString(), expires_at: new Date(nowMs + TTL_MS).toISOString(),
  };
  const file = sessionFile(dir, sessionId);
  const tmp = `${file}.tmp.${pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(entry, null, 2)}\n`);
  fs.renameSync(tmp, file); // atomic per-session write — no shared-file race
  return entry;
}

function readEntries(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    try { out.push({ file, entry: JSON.parse(fs.readFileSync(file, 'utf8')) }); } catch { /* skip unreadable */ }
  }
  return out;
}

// Active sessions; prunes (unlinks) dead-pid / expired files unless opts.prune === false.
function activeSessions(opts = {}) {
  const at = opts.at || new Date().toISOString();
  const alive = opts.pidAlive || pidAlive;
  const active = [];
  for (const { file, entry } of readEntries(opts.dir || REG_DIR)) {
    if (entry.expires_at > at && alive(entry.pid)) active.push(entry);
    else if (opts.prune !== false) { try { fs.unlinkSync(file); } catch { /* already gone */ } }
  }
  return active;
}

// Best-effort: the active runtime(s) other than the current one. Never guesses.
function attributeForeignWriter(currentRuntime, opts = {}) {
  const others = [...new Set(activeSessions(opts).map((s) => s.runtime).filter((r) => r && r !== currentRuntime))];
  if (others.length === 0) return 'undetermined';
  return others.length === 1 ? others[0] : `multiple:${others.join(',')}`;
}

if (require.main === module) {
  const [cmd, runtime] = process.argv.slice(2);
  if (cmd === 'register' && runtime) console.log(JSON.stringify(registerSession(runtime)));
  else console.log(JSON.stringify(activeSessions()));
}

module.exports = { registerSession, activeSessions, attributeForeignWriter, pidAlive, REG_DIR };
