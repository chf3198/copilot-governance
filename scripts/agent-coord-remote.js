// tier: 2
// Layer 3 client wrapper — Cloudflare Worker if CLOUDFLARE_WORKER_URL set,
// else falls through to Layer 4 SQLite (#739 / #740). Same API surface.
let local;
try { local = require('./agent-coord-local'); }
catch { local = null; }

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || '';
const FLEET_ID = process.env.MEGINGJORD_FLEET_ID || 'default';
const FETCH_TIMEOUT_MS = 5000;
let _bannerShown = false;

function _isRemote() {
  return WORKER_URL.length > 0;
}

function _localUnavailable() {
  return new Error('Local Layer 4 unavailable — install Layer 4 module or set CLOUDFLARE_WORKER_URL');
}

function _showBannerOnce() {
  if (_bannerShown) return;
  _bannerShown = true;
  if (!_isRemote()) {
    process.stderr.write(
      'ℹ️  Multi-agent coordination in limited mode (local SQLite only). '
      + 'Set CLOUDFLARE_WORKER_URL to enable cross-machine coordination.\n'
    );
  }
}

async function _post(path, body) {
  const url = `${WORKER_URL}${path}?fleet=${encodeURIComponent(FLEET_ID)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

async function acquireLease(key, ttlSec, agentId) {
  _showBannerOnce();
  if (!_isRemote()) {
    if (!local) throw _localUnavailable();
    return local.acquireLease(key, ttlSec, agentId);
  }
  const result = await _post('/lease/acquire', { key, ttlSec, agentId });
  return result.ok ? result.handle : null;
}

async function releaseLease(handle) {
  if (!handle) return false;
  if (!_isRemote()) {
    if (!local) throw _localUnavailable();
    return local.releaseLease(handle);
  }
  const result = await _post('/lease/release', { key: handle.key, agentId: handle.agentId });
  return !!result.ok;
}

async function heartbeat(agentId) {
  if (!_isRemote()) {
    if (!local) throw _localUnavailable();
    return local.heartbeat(agentId);
  }
  await _post('/heartbeat', { agentId });
}

async function listActiveAgents(maxAgeSec) {
  if (!_isRemote()) {
    if (!local) throw _localUnavailable();
    return local.listActiveAgents(maxAgeSec);
  }
  const url = `${WORKER_URL}/agents?fleet=${encodeURIComponent(FLEET_ID)}&maxAgeSec=${maxAgeSec}`;
  const resp = await fetch(url);
  const data = await resp.json();
  return data.active || [];
}

module.exports = {
  acquireLease, releaseLease, heartbeat, listActiveAgents,
  _isRemote, WORKER_URL, FLEET_ID,
};

if (require.main === module) {
  if (!_isRemote()) {
    process.stderr.write('CLOUDFLARE_WORKER_URL not set — local mode only\n');
    process.exit(0);
  }
  process.stdout.write(`Remote coord: ${WORKER_URL} (fleet=${FLEET_ID})\n`);
}
