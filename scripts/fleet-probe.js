// tier: 3
// fleet-probe.js — busy-vs-unavailable detector for fleet models (#2521)
// Phase-1 AC1 of Epic #2518 per Phase-0 design §3.
// Pure functions; HTTP impl injected for testability.
'use strict';

const http = require('node:http');

const DEFAULT_TIMEOUT_MS = 5000;
const BUSY_THRESHOLD_S = 60;
const DEFAULT_OLLAMA_PORT = 11434;
const QUEUE_HIGH_DEPTH = 3;

function dispatchGet({ host, path, timeoutMs = DEFAULT_TIMEOUT_MS, httpImpl = http }) {
  return new Promise((resolve) => {
    const [hostname, portStr] = host.split(':');
    const req = httpImpl.request({
      hostname, port: parseInt(portStr, 10) || DEFAULT_OLLAMA_PORT,
      path, method: 'GET', timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ ok: true, body: JSON.parse(data), status: res.statusCode }); }
        catch (err) { resolve({ ok: false, error: 'parse_error' }); }
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'network_error' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.end();
  });
}

function parsePsLoaded(psBody, model) {
  if (!psBody || !Array.isArray(psBody.models)) return false;
  return psBody.models.some((m) => m.name === model || m.model === model);
}

function computeBusy(psBody, model) {
  if (!psBody || !Array.isArray(psBody.models)) return { busy: false, queue_depth: 0 };
  const entry = psBody.models.find((m) => m.name === model || m.model === model);
  if (!entry) return { busy: false, queue_depth: 0 };
  // Heuristic: expires_at - now indicates active hold; queue depth via models[].size_vram > 0 count
  const activeCount = psBody.models.filter((m) => (m.size_vram || 0) > 0).length;
  return { busy: activeCount > 0, queue_depth: activeCount };
}

function classify({ reachable, loaded, busy, queue_depth }) {
  if (!reachable) return 'UNAVAILABLE';
  if (!loaded) return 'AVAILABLE';
  if (loaded && !busy) return 'AVAILABLE';
  if (loaded && busy && queue_depth < QUEUE_HIGH_DEPTH) return 'WAIT';
  return 'ROUTE_ELSEWHERE';
}

async function probeHostModel(host, model, opts = {}) {
  const httpImpl = opts.httpImpl || http;
  const versionRes = await dispatchGet({ host, path: '/api/version', httpImpl });
  if (!versionRes.ok) {
    return { reachable: false, loaded: false, busy: false, queue_depth: 0, decision: 'UNAVAILABLE' };
  }
  const psRes = await dispatchGet({ host, path: '/api/ps', httpImpl });
  if (!psRes.ok) {
    return { reachable: true, loaded: false, busy: false, queue_depth: 0, decision: 'AVAILABLE' };
  }
  const loaded = parsePsLoaded(psRes.body, model);
  const { busy, queue_depth } = computeBusy(psRes.body, model);
  const decision = classify({ reachable: true, loaded, busy, queue_depth });
  return { reachable: true, loaded, busy, queue_depth, decision };
}

module.exports = {
  probeHostModel, dispatchGet, parsePsLoaded, computeBusy, classify,
  DEFAULT_TIMEOUT_MS, BUSY_THRESHOLD_S, QUEUE_HIGH_DEPTH,
};
