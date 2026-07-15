#!/usr/bin/env node
'use strict';
// #3174 — fleet overlay readiness report (Tailscale, overlay, probe age, missing keys).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveInventory } = require('./resolve-inventory');
const { loadLocalEnvOnce } = require('./load-local-env');
const { fleetSetupStatus } = require('../../dashboard/api/fleet-setup-status');

const OVERLAY = path.join(os.homedir(), '.megingjord', 'devices.json');

function harnessFleetDoctor(opts = {}) {
  loadLocalEnvOnce();
  const status = fleetSetupStatus();
  const devices = resolveInventory('devices', { probeEnrich: false });
  const online = (devices.devices || []).filter((device) => device.tailscaleIP || device.ip);
  const ready = !status.probeStale && status.missingOptionalKeys.length <= 2;
  const exitCode = ready ? 0 : 1;
  const report = {
    generated_at: new Date().toISOString(),
    mode: status.overlay ? 'overlay' : 'example-only',
    overlayPath: fs.existsSync(OVERLAY) ? OVERLAY : null,
    deviceCount: status.deviceCount,
    onlineHints: online.length,
    probeStale: status.probeStale,
    probeAgeMs: status.probeAgeMs,
    missingOptionalKeys: status.missingOptionalKeys,
    keychain: status.keychain,
    ready,
    degraded: !ready && online.length > 0,
    exitCode,
  };
  if (opts.json) return report;
  return report;
}

function printReport(report) {
  process.stdout.write(`harness-fleet-doctor: ${report.ready ? 'ready' : report.degraded ? 'degraded' : 'missing-config'}\n`);
  process.stdout.write(`  mode=${report.mode} devices=${report.deviceCount} probeStale=${report.probeStale}\n`);
  if (report.missingOptionalKeys.length) {
    process.stdout.write(`  missing keys: ${report.missingOptionalKeys.join(', ')}\n`);
  }
}

if (require.main === module) {
  const json = process.argv.includes('--json');
  const report = harnessFleetDoctor({ json });
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printReport(report);
  process.exit(report.exitCode);
}

module.exports = { harnessFleetDoctor, printReport };
