// tier: 3
// Fleet-dev execution path with a two-part objective gate + one-tier escalation (#2795 P1-2 of Epic
// #2791; design D2, D8-gate). Dispatches a fleet implementation, then runs BOTH a functional gate
// (lint+tests+AC) AND a security gate (secret/dep/SAST); only when BOTH pass is the result accepted (the
// G3 zero-cost win). Any failure escalates EXACTLY ONE tier — never silent-to-Premium: a CAPABILITY
// failure steps fleet→haiku→premium; an AVAILABILITY failure (fleet unreachable) fails over to the $0
// free-cloud lane first (#2619-#2624). The escalation reason is recorded for the #2796 governor +
// telemetry (AC3). FAIL-CLOSED: a gate that can't run is a FAIL (never accept on a gate error). All
// side-effects (dispatch/gates/emit) injectable → tests are network/process-free.
const { defaultFunctionalGate, defaultSecurityGate, defaultEmit } = require('./fleet-dev-gates');

// A SAFE error label: code/name only, never the raw message — a network error message can carry internal
// IPs/hostnames that would leak into telemetry (G4 info-disclosure guard).
const errLabel = (err) => (err && (err.code || err.name)) || 'error';

// One-tier escalation. Capability: step the capability ladder (fleet→haiku→premium). Availability (fleet
// unreachable): fail over to the $0 free-cloud lane FIRST (#2619), then paid. Returns the next tier, or
// null at the top of the ladder (no further escalation).
function escalateTier(currentTier, escalationClass) {
  const ladder = escalationClass === 'availability'
    ? ['fleet', 'free-cloud', 'haiku', 'premium']
    : ['fleet', 'haiku', 'premium'];
  const idx = ladder.indexOf(currentTier);
  return idx >= 0 && idx < ladder.length - 1 ? ladder[idx + 1] : null;
}

// Run a single gate FAIL-CLOSED: a missing/throwing gate, or a non-{pass:true} result, is a FAIL — so the
// path escalates rather than accepting on an unrunnable gate. Returns { pass, detail }.
async function safeGate(gate, result) {
  if (typeof gate !== 'function') return { pass: false, detail: 'gate-not-configured' };
  try {
    const out = await gate(result);
    return { pass: out === true || Boolean(out && out.pass === true), detail: (out && out.detail) || null };
  } catch (err) { return { pass: false, detail: `gate-error: ${errLabel(err)}` }; }
}

// Two-part objective gate: functional AND security. allPass only when both pass.
async function runObjectiveGate(result, gates = {}) {
  const functional = await safeGate(gates.functionalGate || defaultFunctionalGate, result);
  const security = await safeGate(gates.securityGate || defaultSecurityGate, result);
  return { functional, security, allPass: functional.pass && security.pass };
}

// Record the escalation (reason class + telemetry, best-effort) and return the verdict with the next tier.
function escalate(tier, escalationClass, reason, result, gate, opts) {
  const emit = opts.emit || defaultEmit;
  const escalateTo = escalateTier(tier, escalationClass);
  try {
    emit({ event: 'fleet-dev-escalation', from_tier: tier, to_tier: escalateTo,
      escalation_class: escalationClass, reason, ts: (opts.now && opts.now()) || null });
  } catch { /* telemetry is best-effort, never blocks the escalation */ }
  return { accepted: false, tier, escalateTo, escalationClass, reason, gate: gate || null, result: result || null };
}

// Dispatch the fleet implementation. A throw (unreachable) or a not-ok result is an AVAILABILITY escalation;
// otherwise returns { result }. Keeps the dispatch/availability concern out of executeFleetDev's branch count.
async function dispatchFleet(opts, tier) {
  try {
    const result = await opts.dispatch(opts.task, tier);
    if (!result || result.ok === false) {
      return { escalation: escalate(tier, 'availability', (result && result.reason) || 'no-result', result, null, opts) };
    }
    return { result };
  } catch (err) {
    return { escalation: escalate(tier, 'availability', `dispatch-failed: ${errLabel(err)}`, null, null, opts) };
  }
}

// executeFleetDev(opts) -> { accepted, tier, reason, escalationClass?, escalateTo?, gate?, result }.
//   opts.dispatch (async (task,tier)=>result) REQUIRED · opts.tier (default 'fleet') ·
//   opts.functionalGate / securityGate / emit / now (injectable).
async function executeFleetDev(opts = {}) {
  const tier = opts.tier || 'fleet';
  if (typeof opts.dispatch !== 'function') {
    throw new Error('executeFleetDev: opts.dispatch (task, tier) => Promise<result> is required');
  }
  const dispatched = await dispatchFleet(opts, tier);
  if (dispatched.escalation) return dispatched.escalation;
  const gate = await runObjectiveGate(dispatched.result, opts);
  if (gate.allPass) return { accepted: true, tier, reason: 'both-gates-pass', gate, result: dispatched.result };
  // name exactly which part(s) failed so the #2796 governor classifies accurately (both / functional / security).
  const failed = !gate.functional.pass && !gate.security.pass ? 'both'
    : (gate.functional.pass ? 'security' : 'functional');
  return escalate(tier, 'capability', `${failed}-gate-failed`, dispatched.result, gate, opts);
}

module.exports = { executeFleetDev, runObjectiveGate, escalateTier, safeGate };
