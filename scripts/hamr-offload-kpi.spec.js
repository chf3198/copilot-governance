#!/usr/bin/env node
'use strict';

// Regression spec for hamr-offload-kpi (#3015 AC4 / AC-E5, Epic #3008). Self-executing; exit 1 on
// failure. Hermetic: drives computeOffloadKpi against temp JSONL telemetry via env-overridden HOME so
// no real ~/.megingjord state is read. Locks the KPI shape (offload coverage, gate quality, incident
// rate, top escalation reasons) that shipped untested via the #3818 capture.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NOW = Date.parse('2026-07-15T12:00:00.000Z');
const HOUR = 3600000;

function withTempHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hamr-kpi-home-'));
  const dir = path.join(home, '.megingjord');
  fs.mkdirSync(dir, { recursive: true });
  const prevHome = process.env.HOME;
  const prevUserprofile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  // require fresh so os.homedir() (cached at module load via HOME) picks up the temp home
  const modPath = require.resolve('./hamr-offload-kpi');
  delete require.cache[modPath];
  try {
    const mod = require('./hamr-offload-kpi');
    return fn(dir, mod);
  } finally {
    process.env.HOME = prevHome;
    if (prevUserprofile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUserprofile;
    delete require.cache[modPath];
    fs.rmSync(home, { recursive: true, force: true });
  }
}

const writeJsonl = (file, rows) => fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

test('computeOffloadKpi reports coverage, gate quality, incident rate, escalation reasons', () => {
  withTempHome((dir, { computeOffloadKpi }) => {
    // 3 fleet/free-cloud calls + 1 paid => offload coverage 0.75
    writeJsonl(path.join(dir, 'cache-stats.jsonl'), [
      { ts: NOW - HOUR, tier: 'fleet' },
      { ts: NOW - HOUR, tier: 'free-cloud' },
      { ts: NOW - HOUR, tier: 'local' },
      { ts: NOW - HOUR, tier: 'paid' },
    ]);
    // 3 ok + 1 escalated => gate quality 0.75, escalation reason surfaced
    writeJsonl(path.join(dir, 'cost-telemetry.jsonl'), [
      { ts: NOW - HOUR, outcome: 'ok' },
      { ts: NOW - HOUR, outcome: 'ok' },
      { ts: NOW - HOUR, outcome: 'ok' },
      { ts: NOW - HOUR, outcome: 'escalated', escalation_reason: 'availability:free-exhausted' },
    ]);
    writeJsonl(path.join(dir, 'incidents.jsonl'), [{ ts: NOW - HOUR, kind: 'breaker-open' }]);

    const kpi = computeOffloadKpi(NOW);
    assert.strictEqual(kpi.offload_coverage_7d, 0.75);
    assert.strictEqual(kpi.gate_quality_7d, 0.75);
    assert.strictEqual(kpi.incident_rate_7d, 1);
    assert.ok(kpi.top_escalation_reasons.some((r) => r.reason === 'availability:free-exhausted'));
    assert.strictEqual(kpi.sample_size.cache, 4);
  });
});

test('computeOffloadKpi excludes rows older than the 7d window', () => {
  withTempHome((dir, { computeOffloadKpi }) => {
    writeJsonl(path.join(dir, 'cache-stats.jsonl'), [
      { ts: NOW - HOUR, tier: 'fleet' },
      { ts: NOW - 8 * 24 * HOUR, tier: 'fleet' }, // stale, excluded
    ]);
    const kpi = computeOffloadKpi(NOW);
    assert.strictEqual(kpi.sample_size.cache, 1);
  });
});

test('computeOffloadKpi is safe on empty telemetry', () => {
  withTempHome((dir, { computeOffloadKpi }) => {
    const kpi = computeOffloadKpi(NOW);
    assert.strictEqual(kpi.incident_rate_7d, 0);
    assert.strictEqual(kpi.sample_size.cache, 0);
    assert.ok(typeof kpi.offload_coverage_7d === 'number');
  });
});
