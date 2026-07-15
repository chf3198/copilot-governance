#!/usr/bin/env node
'use strict';
// tier: 3
const { execSync } = require('child_process');
const { getProfile, getOpenClawURL } = require('./fleet-config');

// #2974: probe the LiteLLM gateway's readiness endpoint, NOT the deep `/health`.
// `/health` does a per-model backend check that times out (~5s) on cold fleet models
// (e.g. qwen2.5-coder:32b, ~240s cold-start) — returning a false FAIL even when the
// gateway is up and reachable over Tailscale. `/health/readiness` reports proxy-ready
// quickly without the per-model round-trips.
const OPENCLAW_HEALTH_PATH = '/health/readiness';

function run(cmd, { dryRun = false } = {}) {
  if (dryRun) return { ok: true, out: `DRY_RUN ${cmd}` };
  try { return { ok: true, out: execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim() }; }
  catch (e) { return { ok: false, out: (e.stdout || e.message || '').toString().trim() }; }
}

/** Pure check definitions for the preflight (testable without running them). */
function buildChecks(ocURL) {
  return [
    { key: 'tailscale', cmd: 'sudo tailscale status || tailscale status' },
    { key: 'openclaw', cmd: `curl -sf --max-time 5 ${ocURL}${OPENCLAW_HEALTH_PATH}` },
  ];
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const json = process.argv.includes('--json');
  const profile = getProfile();
  if (profile.mode === 'solo') {
    const r = { ok: false, dryRun, mode: 'solo', reason: 'No fleet nodes reachable' };
    if (json) console.log(JSON.stringify(r, null, 2));
    else console.log('OpenClaw preflight: SKIP (solo mode — no fleet)');
    process.exit(2);
  }
  const checks = buildChecks(getOpenClawURL()).map(c => ({ ...c, result: run(c.cmd, { dryRun }) }));
  const ok = checks.every(c => c.result.ok);
  if (json) console.log(JSON.stringify({ ok, dryRun, mode: profile.mode, checks }, null, 2));
  else {
    console.log(`OpenClaw preflight (mode: ${profile.mode})`);
    checks.forEach(c => console.log(`- ${c.key}: ${c.result.ok ? 'OK' : 'FAIL'}`));
  }
  process.exit(ok ? 0 : 2);
}

if (require.main === module) main();

module.exports = { OPENCLAW_HEALTH_PATH, buildChecks, run };
