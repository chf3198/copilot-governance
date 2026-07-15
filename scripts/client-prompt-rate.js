// tier: 1
// client-prompt-rate.js — Epic #3392 AC4 observability.
//
// Three signals make the harness's "minimize client interruption" goal measurable:
//   1. client-prompt-rate = non-carve-out client prompts / total decisions (EXCLUDING the
//      sanctioned carve-out class). Target → 0. A non-zero rate means a routine decision still
//      reached the human; the carve-out class is excluded because those touchpoints are correct.
//   2. adjudication decision log — every cross-model adjudication records {path, risk_tier,
//      panel_scores, confidence, rollback_handle} (schema-v3, G8) so a verdict is auditable.
//   3. reversibility audit — an adjudicated state-mutation records a rollback handle (G2/G6) so a
//      wrong auto-execution can be undone; a non-reversible mutation is flagged.
//
// Reuses event-schema-v3 (emitV3/readEvents). All writes are FAIL-OPEN: a logging error never
// throws into the caller (observability must not break the decision it observes).
'use strict';

const path = require('path');
const schema = require('./event-schema-v3');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SURFACE = path.join(ROOT, 'dashboard', 'events.jsonl');
const SERVICE = 'client-prompt-rate';
// A decision whose route is one of these reached the human; only `human-carveout` is sanctioned.
const PROMPT_ROUTES = new Set(['human-carveout', 'client-prompt']);

function nowIso(ts) { return ts || new Date(0).toISOString(); } // ts injected for determinism

function baseEvent(event, extra, ts) {
  return Object.assign({ ts: nowIso(ts), version: 3, service: SERVICE, env: 'local', event }, extra);
}

/** Append a schema-v3 event; never throws (fail-open observability). */
function safeEmit(event, file) {
  try { schema.emitV3(event, file || DEFAULT_SURFACE); return true; } catch (_err) { return false; }
}

/**
 * Record one decision outcome for the client-prompt-rate signal.
 * @param {{route:string, tier?:string, carveOut?:string}} decision
 * @param {{file?:string, ts?:string}} [opts]
 */
function recordDecision(decision, opts = {}) {
  const route = (decision && decision.route) || 'unknown';
  const reachedHuman = PROMPT_ROUTES.has(route);
  const isCarveOut = route === 'human-carveout' || Boolean(decision && decision.carveOut);
  return safeEmit(baseEvent('governance.client-prompt-decision', {
    decision_route: route,
    risk_tier: (decision && decision.tier) || null,
    reached_human: reachedHuman,
    carve_out: isCarveOut ? (decision.carveOut || 'human-carveout') : null,
    // A non-carve-out prompt is the metric's numerator — the thing we drive to zero.
    non_carve_out_prompt: reachedHuman && !isCarveOut,
    _summary: `decision route=${route} human=${reachedHuman} carveOut=${isCarveOut}`,
  }, opts.ts), opts.file);
}

/**
 * Compute the client-prompt-rate from recorded decision events.
 * @param {Array} events schema-v3 client-prompt-decision events
 * @returns {{nonCarveOutPrompts:number, carveOutPrompts:number, total:number, rate:number}}
 */
function computeClientPromptRate(events) {
  const decisions = (events || []).filter((e) => e && e.event === 'governance.client-prompt-decision');
  const total = decisions.length;
  const nonCarveOutPrompts = decisions.filter((e) => e.non_carve_out_prompt === true).length;
  const carveOutPrompts = decisions.filter((e) => e.carve_out && e.reached_human).length;
  return { nonCarveOutPrompts, carveOutPrompts, total, rate: total ? nonCarveOutPrompts / total : 0 };
}

/** Read decision events from the surface and compute the rate. */
function rateFromSurface(file = DEFAULT_SURFACE) {
  return computeClientPromptRate(schema.readEvents(file));
}

/**
 * Log one adjudication decision to the audit stream (G8).
 * @param {{path?:string, risk_tier?:string, panel_scores?:object, confidence?:number, rollback_handle?:string}} record
 */
function logAdjudication(record = {}, opts = {}) {
  return safeEmit(baseEvent('governance.adjudication-decision', {
    decision_path: record.path || null,
    risk_tier: record.risk_tier || null,
    panel_scores: record.panel_scores || null,
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    rollback_handle: record.rollback_handle || null,
    _summary: `adjudication path=${record.path || '?'} tier=${record.risk_tier || '?'}`,
  }, opts.ts), opts.file);
}

/**
 * Reversibility audit for an adjudicated state-mutation (G2/G6). Returns a rollback handle when the
 * mutation is reversible; flags it (reversible:false) when no rollback handle is available.
 * @param {{path:string, rollback_handle?:string, reversible?:boolean}} mutation
 */
function reversibilityAudit(mutation = {}, opts = {}) {
  const handle = mutation.rollback_handle || null;
  const reversible = mutation.reversible !== false && Boolean(handle);
  safeEmit(baseEvent('governance.reversibility-audit', {
    decision_path: mutation.path || null,
    rollback_handle: handle,
    reversible,
    _summary: `reversibility path=${mutation.path || '?'} reversible=${reversible}`,
  }, opts.ts), opts.file);
  return { reversible, rollback_handle: handle };
}

/**
 * Build a logger compatible with the #3401 adjudication-guardrail `opts.logger` sink. Each guardrail
 * decision record updates the client-prompt-rate signal and (when adjudicated) the decision log.
 * @param {{file?:string, ts?:string}} [opts]
 * @returns {(record:object)=>void}
 */
function makeGuardrailLogger(opts = {}) {
  return function onGuardrailDecision(record) {
    try {
      recordDecision({ route: record.route, tier: record.tier, carveOut: record.tier === 'security-weakening' ? 'security-policy-weakening' : null }, opts);
      if (record.route === 'adjudicate') {
        logAdjudication({
          path: record.question, risk_tier: record.tier || 'options',
          panel_scores: record.perOption || record.panel, confidence: record.score,
          rollback_handle: record.rollback_handle || null,
        }, opts);
      }
    } catch (_err) { /* fail-open: observability never breaks the guardrail */ }
  };
}

module.exports = {
  recordDecision, computeClientPromptRate, rateFromSurface, logAdjudication,
  reversibilityAudit, makeGuardrailLogger, DEFAULT_SURFACE, PROMPT_ROUTES,
};
