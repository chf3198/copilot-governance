// tier: 3
// Phase 0 capability-show — pretty-print the manifest with per-tier feature availability (#788)
const fs = require('fs');
const path = require('path');
const { validateCapabilityManifest } = require('./fleet-envelope-contract');

const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 60 * 60 * 1000;
const STALE_AFTER_HOURS = 24;

function _yes(b) { return b ? '✅' : '❌'; }

function loadManifest() {
  const file = path.join(process.cwd(), '.dashboard', 'capabilities.json');
  if (!fs.existsSync(file)) return null;
  try { return validateCapabilityManifest(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { return null; }
}

const TIER_LABELS = {
  TIER_0: 'Tier 0 — AI Gateway cache (Phase 1)',
  TIER_1: 'Tier 1 — Free orchestrator (Phase 4)',
  TIER_2: 'Tier 2 — RAG MCP (Phase 2)',
  TIER_3: 'Tier 3 — State offload (Phase 3)',
};

function tierAvailability(m) {
  const cfAccount = m.cloudflare?.account?.available;
  const fleetReachable = Object.values(m.fleet || {}).some(f => f.reachable);
  const anyFreeLLM = ['groq', 'cerebras', 'google_ai_studio', 'openrouter']
    .some(p => m.providers?.[p]?.available);
  const mcpRag = m.mcp?.rag_server?.reachable;
  return {
    [TIER_LABELS.TIER_0]: cfAccount,
    [TIER_LABELS.TIER_1]: anyFreeLLM,
    [TIER_LABELS.TIER_2]: mcpRag || fleetReachable,
    [TIER_LABELS.TIER_3]: cfAccount,
  };
}

function _writeBody(m) {
  process.stdout.write(`Tailscale: ${_yes(m.tailscale?.available)}\nFleet hosts:\n`);
  Object.entries(m.fleet || {}).forEach(([host, v]) => {
    process.stdout.write(`  ${_yes(v.reachable)} ${host} (${(v.models || []).length} models)\n`);
  });
  process.stdout.write(`\nCloudflare account: ${_yes(m.cloudflare?.account?.available)}\n\nProviders:\n`);
  Object.entries(m.providers || {}).forEach(([id, v]) => {
    const reason = v.reason ? ` (${v.reason})` : '';
    process.stdout.write(`  ${_yes(v.available)} ${id}${reason}\n`);
  });
  process.stdout.write(`\nMCP RAG server: ${_yes(m.mcp?.rag_server?.reachable)}\n\nCost-reduction tier availability:\n`);
  Object.entries(tierAvailability(m)).forEach(([tier, ok]) => {
    process.stdout.write(`  ${_yes(ok)} ${tier}\n`);
  });
}

function show() {
  const m = loadManifest();
  if (!m) { process.stdout.write('No manifest. Run: npm run capability:probe\n'); return 1; }
  const ageMs = Date.now() - new Date(m.probed_at).getTime();
  const staleNote = ageMs > STALE_AFTER_HOURS * MS_PER_HOUR ? ' (STALE — re-probe recommended)' : '';
  process.stdout.write(`Capabilities probed ${(ageMs / MS_PER_HOUR).toFixed(1)}h ago${staleNote}\n\n`);
  _writeBody(m);
  return 0;
}

if (require.main === module) process.exit(show());

module.exports = { loadManifest, tierAvailability, show };
