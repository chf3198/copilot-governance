'use strict';
// backlog-verdict-panels (#3420, Epic #3398 C2) — the default fleet-first $0 panels
// the `--semantic` lane feeds into backlog-relevance-lane#verdictCascade. `fleetPanel`
// hits the LOCAL Ollama loopback only (zero external egress, G4); `freeCloudPanel`
// reuses the shipped $0 free-cloud providers (#2621) — NEVER a paid model. Each panel
// returns an array of raw model replies, or [] on any availability failure so the
// cascade falls to the deterministic floor rather than escalating cost.
const http = require('node:http');

const FLEET_HOST = '127.0.0.1';
const FLEET_PORT = Number(process.env.OLLAMA_PORT) || 11434;
const FLEET_MODEL = process.env.MEGINGJORD_FLEET_MODEL || 'qwen2.5:7b';
const TIMEOUT_MS = 12000;
const HTTP_OK = 200;

// One local Ollama /api/generate call. Resolves to the reply string, or null on any
// error / non-200 / timeout. Never rejects (loopback only — G4 zero-egress).
function ollamaGenerate(prompt) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ model: FLEET_MODEL, prompt, stream: false });
    const req = http.request({ host: FLEET_HOST, port: FLEET_PORT, path: '/api/generate', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      timeout: TIMEOUT_MS }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode !== HTTP_OK) return resolve(null);
        try { resolve(JSON.parse(body).response || null); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload); req.end();
  });
}

// Fleet panel: a single local model vote (N can grow by sampling; kept at 1 for $0
// loopback). Empty array signals availability failure → free-cloud failover.
async function fleetPanel(prompt) {
  const reply = await ollamaGenerate(prompt);
  return reply ? [reply] : [];
}

// Free-cloud panel: up to `want` distinct $0 providers, each an independent vote for
// median-of-N + minority-veto. Availability failure on all → [] → deterministic floor.
async function freeCloudPanel(prompt, want = 3) {
  let dispatchFreeCloud;
  try { ({ dispatchFreeCloud } = require('./free-cloud-dispatch')); } catch { return []; }
  const replies = [];
  for (let i = 0; i < want; i += 1) {
    try {
      const res = await dispatchFreeCloud(prompt, { tier: 'free-cloud' });
      const content = res && (res.content || res.answer || res.text);
      if (content) replies.push(content);
    } catch { /* provider down — try the next distinct provider */ }
  }
  return replies;
}

function defaultPanels() { return { fleetPanel, freeCloudPanel }; }

module.exports = { defaultPanels, fleetPanel, freeCloudPanel, ollamaGenerate };
