'use strict';
// Review-dispatch free-cloud failover (#2646, G3). When a review dispatcher's fleet
// (Ollama) call fails for AVAILABILITY reasons, fail over to the $0 free-cloud tier
// (#2621 dispatchFreeCloud) so baton cross-family reviews never silently empty out or
// force a paid escalation. CAPABILITY failures (fleet answered but judge/quality
// inadequate) never reach here — the caller invokes this ONLY on availability failure.
const { dispatchFreeCloud } = require('./free-cloud-dispatch');
const { recordTelemetry } = require('./model-routing-telemetry');

// Telemetry is best-effort — a failed emit must never block a review.
function safeRecord(record, entry) { try { record(entry); } catch { /* best-effort */ } }

// Map a dispatchFreeCloud failure into an AC5 degraded_reason sub-case.
function classifyDegradation(fcResult = {}) {
  const tried = Array.isArray(fcResult.tried) ? fcResult.tried : [];
  if (fcResult.reason === 'no_prompt') return 'free-cloud-no-prompt';
  if (tried.length && tried.every((mark) => /:no_key$/.test(mark))) return 'free-cloud-unconfigured';
  if (tried.some((mark) => /timeout|abort/i.test(mark))) return 'free-cloud-timeout';
  return 'free-cloud-exhausted';
}

/**
 * Fail a review over to the free-cloud tier. opts.deps injects
 * {dispatchFreeCloud, recordTelemetry, parseFindings, now} for tests. Returns a
 * dispatcher-shaped envelope: on success the builder-consuming caller sees a real
 * cross-family verdict tagged substituted; on free-cloud failure an advisory degraded
 * envelope (no throw, no paid escalation).
 * @returns {Promise<{findings,raw,modelUsed,hamrStats}>}
 */
async function freeCloudReviewFailover(prompt, opts = {}) {
  const deps = opts.deps || {};
  const dispatch = deps.dispatchFreeCloud || dispatchFreeCloud;
  const record = deps.recordTelemetry || recordTelemetry;
  const parse = deps.parseFindings || (() => ({ findings: [], warning: null }));
  const clock = deps.now || (() => Date.now());
  const start = clock();
  let result;
  try { result = await dispatch(prompt, opts.dispatchOpts || {}); }
  catch (err) { result = { ok: false, reason: 'dispatch_threw', tried: [String(err && err.message)] }; }
  const elapsed = clock() - start;
  if (result.ok && result.content) {
    const reviewer = `free-cloud:${result.provider}`;
    safeRecord(record, { lane: 'free-cloud', model: reviewer, provider: result.provider,
      latencyMs: elapsed, outcome: 'review-failover', taskClass: 'review' });
    const { findings } = parse({ response: result.content });
    // #3167: `text` is the uniform response-text contract across dispatch paths.
    return { findings, raw: result.content, text: result.content, modelUsed: reviewer,
      hamrStats: { ok: true, substituted: true, substituted_reviewer: reviewer,
        substitution_reason: 'fleet-unreachable', tier: 'free-cloud', elapsed } };
  }
  const degradedReason = classifyDegradation(result);
  safeRecord(record, { lane: 'free-cloud', model: 'none', provider: 'none', latencyMs: elapsed,
    outcome: `degraded:${degradedReason}`, taskClass: 'review' });
  return { findings: [], raw: null, text: '', modelUsed: opts.fallbackModel || 'fleet-unreachable',
    hamrStats: { ok: false, degraded: true, degraded_reason: degradedReason,
      suggested_tier: 'free-cloud', elapsed } };
}

// Caller helper (dispatchRedTeam): handle a fleet availability failure end-to-end —
// substituted envelope on free-cloud success, advisory degraded envelope otherwise.
async function onFleetUnavailable(opts = {}) {
  const failover = await freeCloudReviewFailover(opts.prompt, {
    deps: { parseFindings: opts.parseFindings, ...(opts.deps || {}) }, fallbackModel: opts.fallbackModel,
  });
  if (failover.hamrStats.ok) return failover;
  return { findings: [], raw: null, text: '', modelUsed: opts.fallbackModel,
    hamrStats: { ok: false, elapsed: opts.elapsed, error: opts.error, degraded: true,
      degraded_reason: failover.hamrStats.degraded_reason, suggested_tier: 'free-cloud' } };
}

module.exports = { freeCloudReviewFailover, classifyDegradation, onFleetUnavailable };
