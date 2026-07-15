#!/usr/bin/env node
// tier: 3
// hamr-provider-wrapper.js — HAMR Wave 7 child B (#952).
// Opt-in shim: any provider call routes through cacheHeaders + appendCacheStat + spillover.
// Pure library — does NOT modify provider call sites (Copilot Team boundary preserved).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { cacheHeaders } = require('./litellm-client');
const { appendCacheStat } = require('./cache-stats-emit');
const ADAPTERS = require('./token-provider-adapters');
const { providerToGenAiSystem } = require('./event-schema-otel-genai');
const { maybeSpillover } = require('./header-spillover');
const { pickStickyProvider } = require('./sticky-route');
// (#2645) shared .env hydration shim (G3); hydrate once at load so wrapped calls find provider keys
const { loadLocalEnvOnce } = require('./load-local-env');
loadLocalEnvOnce();
// Refs #2234 — wire governance-context injection per Epic #2029 P1-1 #2221.
let injectGoalContext;
try { ({ injectGoalContext } = require('./governance-context')); }
catch { injectGoalContext = () => ({ systemPrefix: null, injected: false }); }

const HTTP_OK_DEFAULT = 200;
const TEAM_CONFIG_PATHS = [
  path.join(os.homedir(), '.claude', 'hamr-config.json'),
  path.join(os.homedir(), '.copilot', 'hamr-config.json'),
  path.join(os.homedir(), '.codex', 'devenv-ops', 'hamr-config.json'),
  path.join(os.homedir(), '.cursor', 'hamr-config.json'),
  // Antigravity runtime (#3448 T2.5 — five-runtime HAMR parity)
  path.join(os.homedir(), '.antigravity', 'hamr-config.json'),
];

/** Read the first available HAMR activation config across team runtimes.
 * @returns {object|null} Parsed config with source file, or null when absent.
 */
function readTeamConfig() {
  for (const file of TEAM_CONFIG_PATHS) {
    if (!fs.existsSync(file)) continue;
    try { return { file, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* skip malformed */ }
  }
  return null;
}

/** Determine whether HAMR wrapping is disabled for the current process.
 * @returns {boolean} True when wrapper should no-op.
 */
function isDisabled() {
  if (process.env.MEGINGJORD_HAMR_DISABLED === '1') return true;
  const cfg = readTeamConfig();
  if (cfg && cfg.enabled === false) return true;
  return false;
}

function emitStatSafe(provider, payload, opts = {}) {
  try {
    const adapter = ADAPTERS[provider];
    if (!adapter) return;
    const tokenRecord = adapter(payload || {}, { provider });
    appendCacheStat({
      provider, model: tokenRecord.model ?? null,
      // P1-5 (#2232): semconv-normalized companion to raw `provider` (always a valid OTel system).
      'gen_ai.system': providerToGenAiSystem(provider),
      cache_read_tokens: tokenRecord.cache_read_tokens ?? 0,
      input_tokens: tokenRecord.input_tokens ?? 0,
      output_tokens: tokenRecord.output_tokens ?? 0,
      executed: 'hamr-provider-wrapper',
      tier: opts.tier ?? null,
    }, opts.file ? { file: opts.file } : {});
  } catch { /* never let stats break the call */ }
}

/** Build the canonical wrapProviderCall result envelope (#1160).
 * Canonical shape: `{ ok, value, sticky, spillover, meta }`.
 * `meta` carries provider-choice telemetry: `{ provider, tier, hamrDisabled, goalContextInjected, error }`.
 * Back-compat aliases (transition period, deprecated): `response` (= value), top-level `error`
 * (= meta.error), `hamr_disabled` (= meta.hamrDisabled) — so any un-migrated reader keeps working.
 * @param {{ok: boolean, value?: *, sticky?: object, spillover?: object, meta?: object}} parts
 * @returns {{ok, value, sticky, spillover, meta, response, error, hamr_disabled}} Canonical envelope.
 */
function makeResult({ ok, value = null, sticky = null, spillover = null, meta = {} }) {
  const m = {
    provider: meta.provider ?? null,
    tier: meta.tier ?? null,
    hamrDisabled: meta.hamrDisabled ?? false,
    goalContextInjected: meta.goalContextInjected ?? false,
    error: meta.error ?? null,
  };
  return {
    ok, value, sticky, spillover, meta: m,
    // back-compat aliases (#1160 AC2) — prefer canonical fields above; these are transitional.
    response: value,
    error: m.error,
    hamr_disabled: m.hamrDisabled,
  };
}

/** Wrap any provider call with HAMR cost levers + observability.
 * @param {string} provider - 'anthropic'|'openai'|'gemini'|'groq'|'cerebras'|'openrouter'|'ollama'.
 * @param {Function} callFn - async fn that performs the provider call; receives `{headers, bodyExtras}`.
 * @param {object} [opts] - { tier, previousProvider, ttlSeconds, cacheKey, request }.
 * @returns {Promise<{ok: boolean, value: *, sticky: object, spillover: object, meta: object}>} Canonical envelope (#1160) with back-compat aliases.
 */
async function wrapProviderCall(provider, callFn, opts = {}) {
  if (isDisabled()) {
    const value = await callFn({ headers: {}, bodyExtras: {} });
    return makeResult({ ok: true, value, meta: { provider, tier: opts.tier ?? null, hamrDisabled: true } });
  }
  const sticky = (opts.tier && opts.tier !== 'diagnostic')
    ? pickStickyProvider(opts.tier, { previousProvider: opts.previousProvider })
    : null;
  // Refs #2178 — fleet-local + ollama-explicit must pin to caller-supplied provider so
  // cost-stats records the actual call target (not a sticky-mis-pick paid provider).
  const effectiveProvider = (opts.tier === 'fleet-local' || provider === 'ollama')
    ? provider
    : (sticky?.provider || provider);
  const hints = cacheHeaders(effectiveProvider, opts);
  // Refs #2234 — opt-out via opts.inject_goal_context=false or tier=diagnostic|test.
  const goalCtx = injectGoalContext(opts);
  if (goalCtx.injected && goalCtx.systemPrefix) {
    hints.bodyExtras = Object.assign({}, hints.bodyExtras || {}, { systemPrefix: goalCtx.systemPrefix });
  }
  const metaBase = { provider: effectiveProvider, tier: opts.tier ?? null, goalContextInjected: !!goalCtx.injected };
  let response;
  try { response = await callFn(hints); }
  catch (err) {
    return makeResult({ ok: false, sticky, meta: { ...metaBase, error: err?.message || 'provider_call_failed' } });
  }
  emitStatSafe(effectiveProvider, response, opts);
  const respShape = { status: response?.status ?? response?.response?.status ?? HTTP_OK_DEFAULT, headers: response?.headers ?? new Map() };
  const spillover = maybeSpillover(effectiveProvider, respShape);
  return makeResult({ ok: true, value: response, sticky, spillover, meta: metaBase });
}

if (require.main === module) {
  console.log(JSON.stringify({ exports: ['wrapProviderCall'], hamr_disabled: isDisabled() }));
}

module.exports = { wrapProviderCall, makeResult, emitStatSafe, isDisabled, readTeamConfig, TEAM_CONFIG_PATHS };
