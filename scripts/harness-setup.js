#!/usr/bin/env node
'use strict';
// #3174 — first-install bootstrap: discover + probe + credential absence report.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { harnessFleetDoctor } = require('./harness-fleet-doctor');

const ROOT = path.resolve(__dirname, '..', '..');

function runHarnessSetup(opts = {}) {
  const steps = [];
  try {
    execFileSync('bash', ['scripts/global/fleet-discover.sh'], { cwd: ROOT, stdio: 'pipe' });
    steps.push({ step: 'discover', ok: true });
  } catch (error) {
    steps.push({ step: 'discover', ok: false, error: error.message });
  }
  try {
    execFileSync('node', ['scripts/global/capability-probe.js'], { cwd: ROOT, stdio: 'pipe' });
    steps.push({ step: 'probe', ok: true });
  } catch (error) {
    steps.push({ step: 'probe', ok: false, error: error.message });
  }
  const doctor = harnessFleetDoctor({ json: true });
  const ok = steps.every((step) => step.ok);
  return { ok, steps, doctor, exitCode: ok ? doctor.exitCode : 1 };
}

if (require.main === module) {
  const result = runHarnessSetup();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.exitCode);
}

module.exports = { runHarnessSetup };
