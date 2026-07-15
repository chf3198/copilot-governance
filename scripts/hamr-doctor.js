#!/usr/bin/env node
// tier: 2
// hamr-doctor.js — HAMR Wave 1 operator CLI: capability + tier + remediation (#896)
// Pure read-only; no paid resource deployment; no live API calls.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { homedir } = require('node:os');
const { probeKeyTier } = require('./baton-signing');
const { judgeFamilies } = require('./judge-quorum');
const { scanHookHealth, repairBrokenLink, hookHealthRemediations } = require('./hook-symlink-health');

const REM = {
  wrangler: { missing: 'Install Wrangler 4.x: `npm i -g wrangler@4 && wrangler login`' },
  r2: { missing: 'Enable R2 in Cloudflare dashboard (~$5/mo) then `wrangler r2 bucket list`' },
  mcp_client: { missing: 'Install MCP SDK: `npm i -g @modelcontextprotocol/sdk`' },
  github_oidc: { missing: 'Configure repo OIDC trust in GitHub settings → Actions → Workflow permissions' },
  npm_trusted_publishing: { missing: 'Run `npm whoami` then add `publishConfig.provenance` to package.json' },
};

function readCapabilities(capPath) {
  if (!fs.existsSync(capPath)) return null;
  try { return JSON.parse(fs.readFileSync(capPath, 'utf8')); } catch { return null; }
}

function tierFor(caps) {
  if (!caps) return { tier: 'tier3-offline', reason: 'no-capability-snapshot' };
  const cfReach = caps.cloudflare?.reachability?.reachable ?? false;
  if (!cfReach) return { tier: 'tier3-offline', reason: 'cloudflare-unreachable' };
  const r2 = caps.r2?.available ?? false;
  const wrangler = caps.wrangler?.available ?? false;
  const mcpClient = caps.mcp?.client?.available ?? false;
  const oidc = caps.github_oidc?.eligible ?? false;
  const npm = caps.npm_trusted_publishing?.eligible ?? false;
  if (r2 && wrangler && mcpClient && oidc && npm) return { tier: 'tier1-full', reason: 'all-capabilities-present' };
  return { tier: 'tier2-degraded', reason: 'partial-capabilities' };
}

function buildRemediations(caps) {
  if (!caps) return [];
  const out = [];
  if (caps.r2?.available === false) out.push({ capability: 'r2', advice: REM.r2.missing });
  if (caps.wrangler?.available === false) out.push({ capability: 'wrangler', advice: REM.wrangler.missing });
  if (caps.mcp?.client?.available === false) out.push({ capability: 'mcp_client', advice: REM.mcp_client.missing });
  if (caps.github_oidc?.eligible === false) out.push({ capability: 'github_oidc', advice: REM.github_oidc.missing });
  if (caps.npm_trusted_publishing?.eligible === false) out.push({ capability: 'npm_trusted_publishing', advice: REM.npm_trusted_publishing.missing });
  return out;
}

/** Build the doctor report — pure function over a capabilities object.
 * @param {object|null} caps - Capabilities snapshot (null if missing).
 * @param {object} keyTier - Result from baton-signing.probeKeyTier().
 * @returns {object} Doctor report — tier, reason, key_tier, judge_families, remediations.
 */
function buildReport(caps, keyTier, hookHealth = { scanned: 0, broken: [] }) {
  const { tier, reason } = tierFor(caps);
  return {
    schema_version: 1,
    tier,
    reason,
    key_tier: keyTier,
    judge_families: Object.keys(judgeFamilies()),
    remediations: [...buildRemediations(caps), ...hookHealthRemediations(hookHealth)],
    hook_health: hookHealth,
    capabilities_snapshot_present: caps !== null,
  };
}

async function runDoctor(opts = {}) {
  const capPath = opts.capPath ?? path.join(homedir(), 'devenv-ops', '.dashboard', 'capabilities.json');
  const caps = readCapabilities(capPath);
  const keyTier = await probeKeyTier();
  const hookHealth = scanHookHealth(opts.hookRoots);
  // --fix removes cyclic/unreadable hook links so the operator can re-deploy (#2972).
  if (opts.fix) {
    for (const item of hookHealth.broken) item.repaired = repairBrokenLink(item.path);
  }
  return buildReport(caps, keyTier, hookHealth);
}

async function main() {
  const wantJson = process.argv.includes('--json');
  const fix = process.argv.includes('--fix');
  const report = await runDoctor({ fix });
  if (wantJson) { console.log(JSON.stringify(report, null, 2)); return; }
  const tierLabel = report.tier.toUpperCase();
  console.log(`HAMR ${tierLabel} (${report.reason})`);
  console.log(`  key tier: ${report.key_tier.tier} (${report.key_tier.source})`);
  console.log(`  judge families available: ${report.judge_families.join(', ')}`);
  const broken = report.hook_health.broken;
  if (broken.length === 0) {
    console.log(`  hook health: ok (${report.hook_health.scanned} deployed hook scripts scanned)`);
  } else {
    console.log(`  hook health: ${broken.length} BROKEN hook script(s) — operator-lockout risk (#2972):`);
    for (const b of broken) {
      console.log(`    [${b.reason}] ${b.path}${b.repaired ? ' (removed by --fix; re-run npm run deploy:claude:apply)' : ''}`);
    }
    if (!fix) console.log('    recover: npm run hamr:doctor --fix');
  }
  if (report.remediations.length === 0) {
    console.log('  remediations: none — all capabilities present');
  } else {
    console.log('  remediations:');
    for (const item of report.remediations) console.log(`    [${item.capability}] ${item.advice}`);
  }
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exitCode = 1; });

module.exports = { buildReport, tierFor, buildRemediations, runDoctor };
