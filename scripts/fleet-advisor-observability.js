/**
 * Fleet Advisor — observability signal + Prometheus exporter + throughput floor (Epic #3414 #3485, §7).
 *
 * Emits ONE schema-v3 `fleet-advisor.report` event per Advisor run to dashboard/events.jsonl carrying
 * the metrics the Epic set out to measure: per-{host,model} tokens/sec, cold-load rate, VRAM-pressure,
 * per-class metrics, free-cloud-fallback rate, and the HEADLINE **dollars-saved** ($ of paid inference
 * avoided by staying on the $0 fleet). The SSE pipeline live-streams it to the "Fleet Advisor
 * throughput & pressure" panel; a thin Prometheus exporter re-publishes the three core metrics; and a
 * CI throughput floor fails the build on regression (G7).
 *
 * Reuses event-schema-v3 (#1339) — this adds one new event TYPE, not a competing schema.
 */
'use strict';

const path = require('path');
const { normalize, isValidV3, emitV3 } = require('./event-schema-v3');

const EVENTS_FILE = path.join(__dirname, '..', '..', 'dashboard', 'events.jsonl');
// Assumed tokens per fleet call for the $-saved estimate (documented, matches free-cloud-usage-report).
const ASSUMED_TOKENS_PER_CALL = 1500;
// Default paid comparison cost ($/1k tokens) — the Haiku tier the fleet call would otherwise use.
const DEFAULT_HAIKU_COST_PER_1K = 0.004;

/**
 * Headline metric: dollars saved by keeping `fleetCalls` on the $0 fleet instead of the paid tier.
 * Conservative — uses the cheaper (Haiku) comparison and a documented tokens/call assumption.
 */
function dollarsSaved(fleetCalls, opts = {}) {
  const calls = Number(fleetCalls) || 0;
  const tokensPerCall = opts.tokensPerCall || ASSUMED_TOKENS_PER_CALL;
  const costPer1k = opts.costPer1k || DEFAULT_HAIKU_COST_PER_1K;
  return Number(((calls * tokensPerCall) / 1000 * costPer1k).toFixed(4));
}

/**
 * Build the schema-v3 `fleet-advisor.report` event from a metrics snapshot. `metrics` carries
 * `perHost` (`[{ host, model, tokensPerSec, coldLoadRate, vramPressure }]`), `perClass`,
 * `freeCloudFallbackRate`, and `fleetCalls`. Deterministic — `opts.ts` is injectable for tests.
 */
function buildReportEvent(metrics = {}, opts = {}) {
  const perHost = Array.isArray(metrics.perHost) ? metrics.perHost : [];
  const saved = dollarsSaved(metrics.fleetCalls, opts);
  const event = normalize({
    ts: opts.ts || new Date().toISOString(),
    service: 'fleet-advisor',
    env: opts.env || 'local',
    event: 'fleet-advisor.report',
    tier: metrics.tier || 'F0',
    per_host: perHost,
    per_class: metrics.perClass || {},
    free_cloud_fallback_rate: Number(metrics.freeCloudFallbackRate) || 0,
    cold_load_rate: avg(perHost.map((h) => h.coldLoadRate)),
    tokens_per_sec: avg(perHost.map((h) => h.tokensPerSec)),
    dollars_saved: saved,
    _summary: `fleet-advisor ${metrics.tier || 'F0'}: $${saved} saved, `
      + `${perHost.length} host(s), fallback ${(Number(metrics.freeCloudFallbackRate) || 0).toFixed(2)}`,
  }, { service: 'fleet-advisor', event: 'fleet-advisor.report', env: opts.env || 'local' });
  return event;
}

/** Mean of a numeric array, 0 for empty (defensive against non-numbers). */
function avg(values) {
  const nums = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(3));
}

/** Emit the report event to dashboard/events.jsonl (validates schema-v3, throws on invalid). */
function emitReport(metrics = {}, opts = {}) {
  const event = buildReportEvent(metrics, opts);
  emitV3(event, opts.file || EVENTS_FILE);
  return event;
}

/**
 * Thin Prometheus text exporter re-publishing the three core metrics per {host,model} label set:
 * fleet_advisor_tokens_per_second, fleet_advisor_cold_load_rate, fleet_advisor_vram_pressure.
 * Returns the exposition text (AC3).
 */
function prometheusExport(metrics = {}) {
  const perHost = Array.isArray(metrics.perHost) ? metrics.perHost : [];
  const lines = [];
  const metric = (name, help, type) => { lines.push(`# HELP ${name} ${help}`); lines.push(`# TYPE ${name} ${type}`); };
  const label = (host) => `{host="${esc(host.host)}",model="${esc(host.model)}"}`;
  metric('fleet_advisor_tokens_per_second', 'Fleet inference throughput per host/model', 'gauge');
  for (const host of perHost) lines.push(`fleet_advisor_tokens_per_second${label(host)} ${Number(host.tokensPerSec) || 0}`);
  metric('fleet_advisor_cold_load_rate', 'Cold-load rate per host/model', 'gauge');
  for (const host of perHost) lines.push(`fleet_advisor_cold_load_rate${label(host)} ${Number(host.coldLoadRate) || 0}`);
  metric('fleet_advisor_vram_pressure', 'VRAM pressure (used/total) per host/model', 'gauge');
  for (const host of perHost) lines.push(`fleet_advisor_vram_pressure${label(host)} ${Number(host.vramPressure) || 0}`);
  metric('fleet_advisor_dollars_saved', 'Dollars saved by staying on the $0 fleet', 'counter');
  lines.push(`fleet_advisor_dollars_saved ${dollarsSaved(metrics.fleetCalls)}`);
  return `${lines.join('\n')}\n`;
}

/** Escape a Prometheus label value. */
function esc(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

/**
 * CI throughput floor (AC2/G7): compare measured tokens/sec per {model,tier} against a floor table.
 * Returns { ok, regressions:[{model,tier,measured,floor}] }. A measured value below its floor is a
 * regression that fails the build.
 */
function checkThroughputFloor(measured = [], floors = {}) {
  const regressions = [];
  for (const row of Array.isArray(measured) ? measured : []) {
    const key = `${row.model}@${row.tier}`;
    const floor = floors[key];
    if (floor !== undefined && Number(row.tokensPerSec) < Number(floor)) {
      regressions.push({ model: row.model, tier: row.tier, measured: Number(row.tokensPerSec), floor: Number(floor) });
    }
  }
  return { ok: regressions.length === 0, regressions };
}

module.exports = {
  dollarsSaved,
  buildReportEvent,
  emitReport,
  prometheusExport,
  checkThroughputFloor,
  isValidV3,
  EVENTS_FILE,
  ASSUMED_TOKENS_PER_CALL,
};
