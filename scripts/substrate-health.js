// tier: 2
// HAMR Wave 2 child 2: substrate-health probe (#911) — runtime tier sensor.
// Per HAMR v3.2 §R7 + v3.2.1 §R9.3. Writes ~/.megingjord/substrate-health.json.
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PROBE_TIMEOUT_MS = 3000;
const HAMR_WORKER_URL = process.env.HAMR_WORKER_URL || 'https://hamr.chf3198.workers.dev';
const OUT_FILE = path.join(os.homedir(), '.megingjord', 'substrate-health.json');

async function withTimeout(label, fn, ms = PROBE_TIMEOUT_MS) {
  try {
    return await Promise.race([
      fn(),
      new Promise((_, rj) => setTimeout(() => rj(new Error(`${label}_timeout`)), ms)),
    ]);
  } catch (e) {
    return { __error: e instanceof Error ? e.message : String(e) };
  }
}

async function probeHamrWorker(workerUrl = HAMR_WORKER_URL) {
  const result = await withTimeout('hamr_worker', async () => {
    const t0 = Date.now();
    const resp = await fetch(`${workerUrl}/healthz`);
    const elapsed_ms = Date.now() - t0;
    if (!resp.ok) return { reachable: false, http_status: resp.status, elapsed_ms };
    const body = await resp.json();
    return {
      reachable: true,
      http_status: resp.status,
      elapsed_ms,
      tier: body.tier,
      reason: body.reason,
    };
  });
  if (result.__error) return { reachable: false, reason: result.__error };
  return result;
}

function deriveTier(probe) {
  if (!probe.hamr_worker.reachable) return { tier: 'tier3-offline', reason: 'hamr-worker-unreachable' };
  if (probe.hamr_worker.tier === 'tier3-offline') return { tier: 'tier3-offline', reason: 'worker-self-reported-offline' };
  const fleetUp = Object.values(probe.fleet || {}).filter((f) => f && f.reachable).length;
  const providersUp = Object.values(probe.providers || {}).filter((p) => p && p.available).length;
  const judgesUp = Object.values(probe.judges || {}).filter((j) => j && j.available).length;
  if (fleetUp === 0 && providersUp === 0) return { tier: 'tier3-offline', reason: 'no-fleet-or-providers' };
  const fullCount = (probe.hamr_worker.tier === 'tier1-full' ? 1 : 0) + (fleetUp >= 1 ? 1 : 0) + (providersUp >= 2 ? 1 : 0) + (judgesUp >= 2 ? 1 : 0);
  if (fullCount === 4) return { tier: 'tier1-full', reason: 'all-substrates-healthy' };
  return { tier: 'tier2-degraded', reason: `partial fleet=${fleetUp} providers=${providersUp} judges=${judgesUp} worker=${probe.hamr_worker.tier}` };
}

function readCapabilities() {
  const capPath = path.join(process.cwd(), '.dashboard', 'capabilities.json');
  if (!fs.existsSync(capPath)) return null;
  try { return JSON.parse(fs.readFileSync(capPath, 'utf8')); } catch { return null; }
}

// F5 (#1041): Cloudflare AI 2026 free-tier availability probe.
async function probeCloudflareAI(token, accountId) {
  if (!token || !accountId) return { reachable: false, reason: 'missing_credentials' };
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=1`;
  try {
    const t0 = Date.now();
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
    return { reachable: r.ok, http_status: r.status, elapsed_ms: Date.now() - t0 };
  } catch (err) { return { reachable: false, reason: err?.message || 'fetch_failed' }; }
}

async function probeSubstrateHealth(opts = {}) {
  const caps = opts.capabilities ?? readCapabilities();
  const probe = {
    schema_version: 1,
    ts: Date.now(),
    hamr_worker: await probeHamrWorker(opts.workerUrl),
    cloudflare_ai: await probeCloudflareAI(
      opts.cfToken ?? process.env.CLOUDFLARE_WORKERS_AI_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN,
      opts.cfAccountId ?? process.env.CLOUDFLARE_ACCOUNT_ID,
    ),
    fleet: caps?.fleet ?? {},
    providers: caps?.providers ?? {},
    judges: { qwen: { available: !!caps?.providers?.cerebras?.available, provenance: 'vendor-attested' },
              llama: { available: !!caps?.providers?.groq?.available, provenance: 'vendor-attested' },
              claude: { available: !!caps?.providers?.anthropic?.available, provenance: 'vendor-attested' },
              gemini: { available: !!caps?.providers?.google_ai_studio?.available, provenance: 'vendor-attested' } },
  };
  const { tier, reason } = deriveTier(probe);
  return { ...probe, tier, reason };
}

async function writeSubstrateHealth(opts = {}) {
  const result = await probeSubstrateHealth(opts);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  writeSubstrateHealth().then((r) => {
    if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
    else console.log(`✅ substrate-health: ${r.tier} (${r.reason}) → ${OUT_FILE}`);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { probeSubstrateHealth, writeSubstrateHealth, probeHamrWorker, probeCloudflareAI, deriveTier, OUT_FILE };
