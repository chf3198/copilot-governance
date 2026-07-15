'use strict';
// Session-ID generation + emitter — Epic #2091 Phase-1 C1 (Fix #1).
// Produces a UUID v4 per-session ID, stable within a session, unique across sessions.
// Stored at ~/.megingjord/session.id (mode 0600); atomic write (tmp + rename).
// MEGINGJORD_SESSION_ID env var takes precedence when set.

const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SESSION_ID_FILE = path.join(os.homedir(), '.megingjord', 'session.id');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Return true iff id is a valid UUID v4 with no path traversal characters. */
function validateSessionId(id) {
  if (typeof id !== 'string') return false;
  if (id.includes('..') || id.includes('/') || id.includes('\0')) return false;
  return UUID_RE.test(id);
}

/** Read the persisted session ID from file; returns null if absent or invalid. */
function readPersistedId() {
  try {
    const raw = fs.readFileSync(SESSION_ID_FILE, { encoding: 'utf8' }).trim();
    return validateSessionId(raw) ? raw : null;
  } catch { /* catch-empty: absent on first session — normal */ }
  return null;
}

/**
 * Emit a new session ID: write atomically to SESSION_ID_FILE (mode 0600).
 * Returns the new ID.
 */
function emitSessionId() {
  const id = randomUUID();
  const dir = path.dirname(SESSION_ID_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${SESSION_ID_FILE}.tmp`;
  fs.writeFileSync(tmp, `${id}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, SESSION_ID_FILE);
  try { fs.chmodSync(SESSION_ID_FILE, 0o600); } catch { /* catch-empty: best-effort; rename already applied mode */ }
  return id;
}

/**
 * Get the current session ID.
 * Priority: env var → persisted file → emit new.
 */
function getSessionId() {
  const env = process.env.MEGINGJORD_SESSION_ID;
  if (env && validateSessionId(env)) return env;
  return readPersistedId() ?? emitSessionId();
}

module.exports = { getSessionId, emitSessionId, validateSessionId, SESSION_ID_FILE };

if (require.main === module) {
  process.stdout.write(`${getSessionId()}\n`);
}
