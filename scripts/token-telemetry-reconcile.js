#!/usr/bin/env node
'use strict';
// tier: 4
/** Token telemetry reconciliation + drift alerting. */
const path = require('path');
const fs = require('fs');
const { readTelemetry } = require('./model-routing-telemetry');
const { buildTokenTelemetryReport } = require('./token-telemetry-report');
const REPORT_FILE = path.join(__dirname, '..', '..', 'logs', 'token-telemetry-reconcile.json');
const DEFAULT_THRESHOLDS = { drift_pct: 0.15, drift_pct_fail: 0.35, min_samples: 3 };
const HAMR = (() => { try { return require('./hamr-provider-wrapper'); } catch { return null; } })();
async function viaHamr(p, fn) {
  if (!HAMR?.wrapProviderCall || process.env.MEGINGJORD_HAMR_DISABLED === '1') return fn();
  const r = await HAMR.wrapProviderCall(p, fn, { tier: 'observability' }); return r.value ?? r; // #1160 canonical (alias: r.response)
}
function loadEnv() { try { require('./load-local-env').loadLocalEnvOnce(); } catch {} }
const EXACT = new Set(['exact_request', 'exact_aggregate']);
function providerMeta(days) {
  const map = {};
  readTelemetry(days).forEach(entry => {
    const key = entry.provider || 'unknown';
    const row = map[key] || { lanes: new Set(), total: 0, exact: 0 };
    row.lanes.add(entry.lane || 'unknown'); row.total += 1; if (EXACT.has(entry.confidence_level)) row.exact += 1; map[key] = row;
  });
  return map;
}
async function fetchJson(url, headers = {}) {
  const resp = await fetch(url, { headers }); if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status}` };
  try { return { ok: true, data: await resp.json() }; } catch { return { ok: false, reason: 'parse_error' }; }
}
function pickUsageTokens(data) { return Number(data?.usage_tokens ?? data?.total_tokens ?? data?.data?.usage ?? data?.usage?.total_tokens ?? null); }

async function fetchProviderAggregate(provider) {
  loadEnv();
  if (provider === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return { ok: false, reason: 'no_key', usage_tokens: null };
    const result = await viaHamr('openrouter', () => fetchJson('https://openrouter.ai/api/v1/auth/key', { Authorization: `Bearer ${key}` }));
    return { ok: result.ok, reason: result.reason || null, usage_tokens: pickUsageTokens(result.data) };
  }
  if (provider === 'anthropic' && process.env.ANTHROPIC_USAGE_URL) {
    const result = await viaHamr('anthropic', () => fetchJson(process.env.ANTHROPIC_USAGE_URL, { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' }));
    return { ok: result.ok, reason: result.reason || null, usage_tokens: pickUsageTokens(result.data) };
  }
  if (provider === 'litellm' && process.env.LITELLM_USAGE_URL) {
    const result = await viaHamr('litellm', () => fetchJson(process.env.LITELLM_USAGE_URL, { Authorization: `Bearer ${process.env.LITELLM_API_KEY || ''}` }));
    return { ok: result.ok, reason: result.reason || null, usage_tokens: pickUsageTokens(result.data) };
  }
  return { ok: false, reason: 'no_aggregate_api', usage_tokens: null };
}

function verdictForDrift(drift, cfg) {
  if (drift === null) return 'UNREACHABLE';
  if (drift >= cfg.drift_pct_fail) return 'FAIL';
  if (drift >= cfg.drift_pct) return 'WARN';
  return 'OK';
}

async function buildReconciliationReport(days = 30, thresholds = {}) {
  const cfg = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const summary = buildTokenTelemetryReport(days);
  const meta = providerMeta(days);
  const alerts = [], verdicts = [];
  for (const row of summary.providers) {
    if (row.samples < cfg.min_samples) { verdicts.push({ provider: row.provider, verdict: 'SKIP', reason: 'insufficient_samples' }); continue; }
    const provider = row.provider;
    const pMeta = meta[provider] || { lanes: new Set(['unknown']), total: 1, exact: 0 };
    const agg = await fetchProviderAggregate(row.provider);
    const drift = (agg.ok && agg.usage_tokens != null)
      ? +Math.abs(row.total_tokens - agg.usage_tokens) / agg.usage_tokens
      : null;
    const verdict = agg.ok ? verdictForDrift(drift, cfg) : 'UNREACHABLE';
    const lane = Array.from(pMeta.lanes).join(',');
    const confidenceImpact = +((pMeta.total - pMeta.exact) / pMeta.total).toFixed(3);
    verdicts.push({ provider, lane, confidence_impact: confidenceImpact, verdict, local_tokens: row.total_tokens, remote_tokens: agg.usage_tokens, drift_pct: drift != null ? +drift.toFixed(4) : null, agg_ok: agg.ok });
    if (verdict === 'FAIL' || verdict === 'WARN') alerts.push({ provider, lane, confidence_impact: confidenceImpact, verdict, drift_pct: +drift.toFixed(4) });
  }
  return {
    generated_at: new Date().toISOString(), period_days: days, thresholds: cfg,
    summary_samples: summary.samples, verdicts, alerts,
    overall: alerts.some(a => a.verdict === 'FAIL') ? 'FAIL' : alerts.length ? 'WARN' : 'OK',
  };
}

async function writeReconciliationReport(days = 30, thresholds = {}) {
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  const report = await buildReconciliationReport(days, thresholds);
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dIdx = args.indexOf('--days');
  const days = Number(dIdx >= 0 ? (args[dIdx + 1] || 30) : 30);
  writeReconciliationReport(days).then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { buildReconciliationReport, writeReconciliationReport, REPORT_FILE, DEFAULT_THRESHOLDS };
