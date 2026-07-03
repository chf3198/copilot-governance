#!/usr/bin/env node
// tier: 3
// Dashboard API handler — resolves all paths from COPILOT_HOME
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

function jsonRes(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function proxyGet(url, headers, timeout = 5000) {
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? require('https') : http;
    const req = mod.get(url, { headers, timeout }, r => {
      let body = ''; r.on('data', c => body += c);
      r.on('end', () => resolve({ status: r.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 502, body: '{}' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 504, body: '{}' }); });
  });
}

function getHostInfo() {
  const up = os.uptime(); const h = Math.floor(up / 3600); const m = Math.floor((up % 3600) / 60);
  return { hostname: os.hostname(), platform: os.platform(), arch: os.arch(),
    uptime: `${h}h ${m}m`, memory: `${(os.freemem()/1e9).toFixed(1)}/${(os.totalmem()/1e9).toFixed(1)} GB`,
    nodeVersion: process.version, timestamp: new Date().toISOString() };
}

function loadFleet() {
  try { return require('./fleet-config'); } catch { return null; }
}

function buildFleetMap(fc) {
  if (!fc) return {};
  const fleet = {};
  for (const d of fc.resolveFleet()) {
    if (!d.resolvedIP) continue; const ip = d.resolvedIP;
    fleet[d.id] = `http://${ip}:11434`;
    if (d.services?.includes('openclaw')) fleet['openclaw-litellm'] = `http://${ip}:4000`;
  }
  return fleet;
}

async function handleApi(req, res, copilotHome) {
  const u = req.url.split('?')[0];
  const fc = loadFleet(); const FLEET = buildFleetMap(fc);
  const ocUrl = fc?.getOpenClawURL?.() || '';
  if (u === '/api/fleet/windows-laptop/openclaw/health' && ocUrl) {
    const r = await proxyGet(`${ocUrl}/health`); return jsonRes(res, r.status, r.body);
  }
  const fm = u.match(/^\/api\/fleet\/([^/]+)\/(.+)$/);
  if (fm) {
    const base = FLEET[fm[1]];
    if (!base) return jsonRes(res, 404, { error: 'unknown device' });
    const r = await proxyGet(`${base}/${fm[2]}`); return jsonRes(res, r.status, r.body);
  }
  if (u === '/api/openrouter/credits') {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return jsonRes(res, 503, { error: 'no key' });
    const r = await proxyGet('https://openrouter.ai/api/v1/auth/key', { Authorization: `Bearer ${key}` });
    return jsonRes(res, r.status, r.body);
  }
  if (u === '/api/anneal/queue') {
    const handler = require(path.join(process.cwd(), 'dashboard', 'api', 'anneal-queue-handlers.js'));
    return handler.handleAnnealQueue(req, res);
  }
  if (u === '/api/host-info') return jsonRes(res, 200, getHostInfo());
  if (u === '/api/governance') {
    try {
      const hooksDir = path.join(copilotHome, 'hooks');
      const rs = JSON.parse(fs.readFileSync(path.join(hooksDir, 'repo-scope.json'), 'utf8'));
      const gs = JSON.parse(fs.readFileSync(path.join(hooksDir, 'global-standards.json'), 'utf8'));
      return jsonRes(res, 200, { enabled: rs.default_enabled, repoScope: rs, hooks: gs.hooks });
    } catch (e) { return jsonRes(res, 500, { error: 'governance unavailable' }); }
  }
  if (u === '/api/wiki-health') {
    try {
      const { scanHealth } = require('../wiki/health-contract');
      const h = scanHealth(path.join(copilotHome, 'wiki'));
      return jsonRes(res, 200, { ...h, status: h.pages > 0 ? 'healthy' : 'empty' });
    } catch { return jsonRes(res, 200, { pages: 0, issues: 0, status: 'unavailable' }); }
  }
  jsonRes(res, 404, { error: 'not found' });
}

module.exports = { handleApi };
