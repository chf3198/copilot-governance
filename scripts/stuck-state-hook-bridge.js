#!/usr/bin/env node
'use strict';
// stuck-state-hook-bridge.js — #3766. Thin, fail-safe bridge that lets a live hook (Python) invoke the
// shipped, ADVISORY stuck-state-detector (#3748) and the adjudication-guardrail (#3059) WITHOUT duplicating
// any detection or routing logic. Given a signal bundle it returns {detected, route} so the hook can emit
// advisory guidance — NEVER a client prompt (a genuinely irreversible/high-destructive gate routes to
// `human-carveout`, the only sanctioned escalation). The default CLI path is SYNCHRONOUS and network-free
// (classifyDecision, the guardrail's carve-out authority) so a Stop hook stays inside its timeout and works
// offline (G6). `--decide` opts into the full async panel (routeStuckState -> decide()) for operator/tests.
const { detectStuckState, gateToFlags, routeStuckState } = require('./stuck-state-detector');
const guardrail = require('./adjudication-guardrail');

/** Build the operator-facing stuck-state question from the fired triggers. */
function stuckQuestion(triggers) {
  return `Stuck-state detected (${(triggers || []).join(', ') || 'unknown'}); how should the operator resolve it autonomously?`;
}

/**
 * SYNCHRONOUS, network-free classification — the hook path. Reuses detectStuckState + gateToFlags +
 * adjudication-guardrail.classifyDecision (the 4-carve-out routing authority). NEVER throws.
 * @param {object} signals detector signal bundle
 * @param {object} [opts] threshold/hysteresis overrides forwarded to detectStuckState
 * @returns {{detected:boolean, advisory:true, triggers:string[], route?:string, tier?:string, reason?:string, gate?:object, error?:boolean}}
 */
function classifyStuck(signals = {}, opts = {}) {
  try {
    const det = detectStuckState(signals, opts);
    if (!det.stuck) return { detected: false, advisory: true, triggers: [], error: Boolean(det.error) };
    const cls = guardrail.classifyDecision({ question: stuckQuestion(det.triggers), options: [], flags: gateToFlags(det.gate) });
    return { detected: true, advisory: true, triggers: det.triggers, route: cls.route, tier: cls.tier, reason: cls.reason, gate: det.gate };
  } catch { return { detected: false, advisory: true, triggers: [], error: true }; }
}

/**
 * ASYNC full path — routes a detected stuck-state through the real adjudication panel (decide()).
 * Delegates to the detector's own fail-safe routeStuckState; NEVER prompts the client, NEVER rejects.
 * @param {object} signals detector signal bundle
 * @param {object} [opts] forwarded to routeStuckState (may inject a fake decide for tests)
 * @returns {Promise<object>} routeStuckState record ({detected, advisory, triggers, gate?, decision?})
 */
async function routeStuck(signals = {}, opts = {}) {
  try { return await routeStuckState(signals, opts); }
  catch { return { detected: false, advisory: true, triggers: [], error: true }; }
}

/** Read all of stdin (best-effort; empty on any error). */
function readStdin() {
  try { return require('node:fs').readFileSync(0, 'utf8'); } catch { return ''; }
}

async function main(argv) {
  let signals = {};
  try { signals = JSON.parse(readStdin() || '{}') || {}; } catch { signals = {}; }
  const result = argv.includes('--decide') ? await routeStuck(signals) : classifyStuck(signals);
  process.stdout.write(JSON.stringify(result));
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => process.exit(c || 0)).catch(() => process.exit(0));
}

module.exports = { classifyStuck, routeStuck, stuckQuestion };
