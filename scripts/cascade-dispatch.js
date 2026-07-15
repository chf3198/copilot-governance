#!/usr/bin/env node
'use strict';
// tier: 3
// Cascade dispatch: Ollama → heuristic gate → judge gate → escalation signal.

// #2929 C3: probe-first dispatchFleet (LiteLLM→direct-Ollama, no 120s hang, observable switch).
const { dispatchFleet } = require('./litellm-client');
const { recordTelemetry } = require('./model-routing-telemetry');
const { getProfile } = require('./fleet-config');
const { judgeResponse } = require('./local-judge');
const policy = require('./model-routing-policy.json');
const { backoff, isRateLimitError } = require('./backoff');
const { dispatchFreeCloud } = require('./free-cloud-dispatch'); // execute free $0 cloud on fleet-down
// (#2645) shared .env hydration shim — make provider keys visible for the free-cloud fallback (G3)
const { loadLocalEnvOnce } = require('./load-local-env');
// (#2842 / Epic #2926 C2) progress observability so the operator sees the free fleet working
const { withProgress } = require('./dispatch-progress');
const { buildContextualPrompt } = require('./fleet-context-dispatch');
const { resolveFleetRoute } = require('./fleet-stakes-router'); // #3484 stakes gate + keep_alive

const HEARTBEAT_MS = 30_000;

// #2619 / #2930 C4: cost-ascending escalation is now owned by fleet-escalation-policy.js, which
// hard-pins availability failures to free-cloud (NEVER premium) and steps capability failures one
// paid tier up — backed by the shared circuit-breaker. escalationTier stays as the back-compat
// tier-string wrapper; the breaker-aware decision is fleetPolicy.escalate().
const fleetPolicy = require('./fleet-escalation-policy');
const cb = require('./circuit-breaker');
const fleetBreaker = cb.create(); // in-process: skip the fleet attempt once it is known-down (5-fail/30s).
function escalationTier(reason) {
  return fleetPolicy.tierFor(reason);
}

function hints(prompt) {
  const t = prompt.toLowerCase();
  return {
    expectsCode: /```|function|def |class |import |require/.test(t),
    expectsJson: /json|object|array|\{|\[/.test(t) && !/explain|describe|what/.test(t),
    isLookup: /^(what|where|when|who|which|list|show|find|get)\b/.test(t.trim()),
  };
}

function assessQuality(content, h) {
  if (!content || content.trim().length < 30) return { pass: false, reason: 'too_short' };
  if (h.expectsCode && !/`|function|def |class |=>|const |let |var /.test(content)) return { pass: false, reason: 'no_code_structure' };
  if (h.expectsJson) {
    const m = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) return { pass: false, reason: 'no_json_found' };
    try { JSON.parse(m[0]); } catch { return { pass: false, reason: 'invalid_json' }; }
  }
  return { pass: true, reason: 'ok' };
}

async function tryOllama(prompt, model, attempt = 0, keepAlive) {
  // #2929 C3: probe-first dispatch — a down/slow LiteLLM gateway falls straight to direct Ollama
  // (no 120s hang); the LiteLLM→Ollama switch is emitted to stderr + telemetry.
  // #2842: wrapped in withProgress for the tier-start + 30s heartbeat (G3>>G7 patience).
  const result = await withProgress(
    `fleet inference (${model})`,
    () => dispatchFleet(prompt, { model, maxTokens: 1024, keepAlive }),
    { intervalMs: HEARTBEAT_MS }
  );
  if (!result.ok) {
    if (isRateLimitError(result) && attempt < 3) {
      await backoff(attempt);
      return tryOllama(prompt, model, attempt + 1, keepAlive);
    }
    // #2973 (F3): preserve dispatchFleet's fallback_reason (e.g. gateway-unhealthy) so the true
    // outage signal survives — not just the last attempt's result.error.
    return { ok: false, reason: result.error || 'ollama_unreachable', fallback_reason: result.fallback_reason, tier: 'local' };
  }
  return { ok: true, content: result.content, model: result.model, tier: 'local' };
}

function resolvePrompt(prompt, opts = {}) {
  if (!opts.ticket && !opts.paths && !opts.wikiQuery) return prompt;
  try {
    return buildContextualPrompt({ ticket: opts.ticket, paths: opts.paths, wikiQuery: opts.wikiQuery, task: prompt, maxContextChars: opts.maxContextChars }).prompt;
  } catch (err) {
    process.stderr.write(`[cascade] context envelope skipped: ${err.message}\n`);
    return prompt;
  }
}

async function cascade(prompt, opts = {}) {
  // (#2645) G3: hydrate provider keys for the free-cloud fallback
  if (!opts.env) loadLocalEnvOnce();
  // #3484: deterministic stakes gate — routine → resident hot model (keep_alive-pinned), high-stakes → 32B.
  // The existing default is preserved as the hot model so routine dispatch behavior is unchanged.
  const route = resolveFleetRoute(prompt, { ...opts, hotModel: opts.hotModel || 'qwen2.5:7b-instruct' });
  const model = opts.model || route.model;
  const keepAlive = opts.keepAlive || route.keepAlive;
  prompt = resolvePrompt(prompt, opts);
  const h = hints(prompt); const start = Date.now(); const nowMs = start;
  // #2930 C4: if the fleet breaker is open (known-down), skip the fleet attempt entirely and fail
  // straight to free-cloud — don't pay the probe+timeout cost on every call during an outage.
  const breakerBlocksFleet = !cb.canPass(fleetBreaker, nowMs);
  const local = breakerBlocksFleet
    ? { ok: false, reason: 'circuit-open', tier: 'local' }
    : await tryOllama(prompt, model, 0, keepAlive);
  const latency = Date.now() - start;
  if (local.ok) cb.recordSuccess(fleetBreaker); // fleet answered → reset the breaker.

  if (!local.ok) {
    // #2930 C4: availability failures record into the breaker (only when we actually tried fleet —
    // a skipped attempt must not re-stamp the cooloff) and NEVER escalate an outage to a paid tier.
    const decision = fleetPolicy.escalate({
      // #2973 (F1): the fleet produced NO content here, so this is STRUCTURALLY an availability
      // failure — classify it as such regardless of the (telemetry-only) reason string.
      outcome: 'no-answer',
      reason: local.reason, currentTier: 'fleet',
      breaker: breakerBlocksFleet ? null : fleetBreaker, nowMs,
    });
    const esc = decision.tier; // availability -> free-cloud (never premium); capability -> one paid tier up
    if (esc === 'free-cloud' && opts.executeFreeCloud !== false) {
      // #2842: surface the (previously silent) availability failover so the operator sees it stay $0.
      process.stderr.write(`[cascade] fleet unavailable (${local.reason}) → free-cloud failover ($0)\n`);
      // #2621: actually execute a $0 cloud provider; graceful fall-through to advisory signal.
      const fc = await dispatchFreeCloud(prompt, opts.freeCloud || {});
      if (fc.ok) {
        recordTelemetry({ lane: 'free-cloud', model: fc.provider, outcome: 'ok', escalation: null,
          escalation_reason: local.reason, latency_ms: Date.now() - start, execute: true });
        return { ok: true, content: fc.content, tier: 'free-cloud', confidence: 'medium',
          escalation_needed: false, provider: fc.provider };
      }
    }
    recordTelemetry({ lane: 'fleet', model, outcome: 'fail', escalation: esc,
      escalation_reason: local.reason, latency_ms: latency, execute: true });
    return { ok: false, tier: 'local', escalation_needed: true,
      suggested_tier: esc, reason: local.reason };
  }

  const quality = assessQuality(local.content, h);
  if (!quality.pass) {
    const esc = escalationTier(quality.reason); // capability failure -> haiku
    recordTelemetry({ lane: 'fleet', model, outcome: 'escalate', escalation: esc,
      quality_reason: quality.reason, response_length: local.content.length, latency_ms: latency, execute: true });
    return { ok: true, content: local.content, tier: 'local', confidence: 'low',
      escalation_needed: true, suggested_tier: esc, quality_reason: quality.reason };
  }

  const jcfg = policy.judge; // Layer 2: judge gate (semantic quality, independent model)
  const j = jcfg?.enabled ? await judgeResponse(prompt, local.content, { threshold: jcfg.threshold, judgeModel: jcfg.model }) : null;
  const judgePass = !j || !j.ok || j.decision === 'return';
  const judgeEsc = escalationTier('judge_low_score'); // capability failure -> haiku
  recordTelemetry({ lane: 'fleet', model, outcome: judgePass ? 'ok' : 'escalate',
    escalation: judgePass ? null : judgeEsc, quality_reason: quality.reason,
    ...(j?.ok && { judge_model: j.judge_model, judge_score: j.judge_score,
      judge_decision: j.decision, judge_latency_ms: j.latency_ms }),
    response_length: local.content.length, latency_ms: latency, execute: true });
  if (!judgePass)
    return { ok: true, content: local.content, tier: 'local', confidence: 'low',
      escalation_needed: true, suggested_tier: judgeEsc, quality_reason: 'judge_low_score' };
  return { ok: true, content: local.content, tier: 'local', confidence: 'high',
    escalation_needed: false, model };
}

async function main() {
  const args = process.argv.slice(2);
  const prompt = args[args.indexOf('--prompt') + 1] || '';
  const ticket = args[args.indexOf('--ticket') + 1] || undefined;
  const model = args[args.indexOf('--model') + 1] || undefined;
  const json = args.includes('--json');
  if (!prompt) { console.error('--prompt required'); process.exit(1); }
  if (getProfile().mode === 'solo') {
    const soloResult = { ok: false, tier: 'local', escalation_needed: true, suggested_tier: escalationTier('fleet_unavailable'), reason: 'fleet_unavailable' };
    console.log(json ? JSON.stringify(soloResult) : `escalation_needed=true reason=fleet_unavailable suggested_tier=${soloResult.suggested_tier}`);
    return;
  }
  const result = await cascade(prompt, { model, ticket });
  if (json) return console.log(JSON.stringify(result, null, 2));
  if (result.ok) console.log(result.content);
  if (result.escalation_needed) process.stderr.write(`[cascade] escalate→${result.suggested_tier}: ${result.reason || result.quality_reason}\n`);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { cascade, assessQuality, hints, escalationTier, resolvePrompt };
