// tier: 2
// Layer 4: Local SQLite WAL coordination primitive (#739)
// API surface mirrors what Layer 3 (Cloudflare DO, #740) will implement.
const path = require('path');
const fs = require('fs');
let Database;
try { Database = require('better-sqlite3'); }
catch { Database = null; }

const DB_DIR = path.join(process.cwd(), '.dashboard');
const DB_PATH = path.join(DB_DIR, 'agent-state.sqlite');
const MS_PER_SEC = 1000;
const STATUS_LOOKBACK_SEC = 300;

let _db = null;

function _open() {
  if (_db) return _db;
  if (!Database) {
    throw new Error('better-sqlite3 not installed; agent coord disabled');
  }
  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`CREATE TABLE IF NOT EXISTS leases (
    key TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`);
  _db.exec(`CREATE TABLE IF NOT EXISTS heartbeats (
    agent_id TEXT PRIMARY KEY,
    last_seen INTEGER NOT NULL
  )`);
  return _db;
}

function acquireLease(key, ttlSec, agentId) {
  const db = _open();
  const now = Date.now();
  const existing = db.prepare('SELECT expires_at FROM leases WHERE key = ?').get(key);
  if (existing && existing.expires_at > now) return null;
  const expiresAt = now + ttlSec * MS_PER_SEC;
  db.prepare('INSERT OR REPLACE INTO leases (key, agent_id, expires_at) VALUES (?, ?, ?)')
    .run(key, agentId, expiresAt);
  return { key, agentId, expiresAt };
}

function releaseLease(handle) {
  if (!handle) return false;
  const db = _open();
  const result = db.prepare('DELETE FROM leases WHERE key = ? AND agent_id = ?')
    .run(handle.key, handle.agentId);
  return result.changes > 0;
}

function heartbeat(agentId) {
  const db = _open();
  db.prepare('INSERT OR REPLACE INTO heartbeats (agent_id, last_seen) VALUES (?, ?)')
    .run(agentId, Date.now());
}

function listActiveAgents(maxAgeSec) {
  const db = _open();
  const cutoff = Date.now() - maxAgeSec * MS_PER_SEC;
  return db.prepare('SELECT agent_id, last_seen FROM heartbeats WHERE last_seen >= ?')
    .all(cutoff);
}

function _close() {
  if (_db) { _db.close(); _db = null; }
}

module.exports = {
  acquireLease, releaseLease, heartbeat, listActiveAgents, _close,
  DB_PATH,
};

if (require.main === module) {
  const [, , cmd, ...args] = process.argv;
  if (cmd === 'status') {
    const agents = listActiveAgents(STATUS_LOOKBACK_SEC);
    process.stdout.write(`Active agents (last 5 min): ${agents.length}\n`);
    agents.forEach(a => process.stdout.write(`  ${a.agent_id} (${new Date(a.last_seen).toISOString()})\n`));
  } else {
    process.stderr.write('Usage: node agent-coord-local.js status\n');
  }
}
