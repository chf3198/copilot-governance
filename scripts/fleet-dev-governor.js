// tier: 3
// Escalation-rate governor with hysteresis + shadow re-promotion (#2796 P1-3 of Epic #2791; design D3).
// Tracks per-TASK-CLASS (default unit = area-label) fleet escalation rate over a VELOCITY-RELATIVE window
// (the last N attempts — never a calendar threshold, per the agentic-traffic lesson). Hysteresis prevents
// flapping: DEMOTE a promoted class off the fleet at >40% escalation, RE-PROMOTE a demoted class only at
// <25% (the 25-40% band holds). On demotion the window resets (fresh sample) + a Tier-2 anneal
// `fleet-dev-class-mis-profiled` + a re-profile signal are emitted (G8). SHADOW re-promotion: a demoted
// class still runs on the fleet in shadow (output discarded, scored vs the accepted result), so
// re-promotion is DATA-DRIVEN after a model refresh (D6) — the shadow rate drives it, not a timer.
// Pure: the caller owns the persisted state dict; telemetry emit is injectable.
const fs = require('fs');
const path = require('path');
const { resolveTelemetryFile } = require('./fleet-telemetry-path');

const WINDOW_N = 20;     // velocity-relative window: judge on the last N attempts (not calendar)
const MIN_SAMPLE = 5;    // never transition on a tiny sample → hold (fail-safe)
const DEMOTE_AT = 0.40;  // > this fleet-escalation rate demotes a promoted class
const PROMOTE_AT = 0.25; // < this (shadow) rate re-promotes a demoted class — the gap is the anti-flap band
const TELEMETRY = path.join(process.env.HOME || '', '.megingjord', 'fleet-dev-governor.jsonl');

// Own-property class entry (default promoted, empty window). The class map is a NULL-prototype object so a
// hostile class name like '__proto__' becomes a normal own key, never prototype pollution.
function classEntry(state, taskClass) {
  let classes = state.classes;
  if (!classes || Object.getPrototypeOf(classes) !== null) classes = state.classes = Object.assign(Object.create(null), classes);
  if (!Object.prototype.hasOwnProperty.call(classes, taskClass)) classes[taskClass] = { status: 'promoted', window: [] };
  return classes[taskClass];
}

// Record one fleet/shadow outcome (escalated = did the two-part gate fail → escalate?). Bounded window.
function recordOutcome(state, taskClass, escalated) {
  const entry = classEntry(state, taskClass);
  entry.window.push(Boolean(escalated));
  while (entry.window.length > WINDOW_N) entry.window.shift();
  return entry;
}

// Escalation rate over the window, or null when the sample is too small to judge (fail-safe → hold).
function escalationRate(entry) {
  const count = entry && entry.window ? entry.window.length : 0;
  if (count < MIN_SAMPLE) return null;
  return entry.window.filter(Boolean).length / count;
}

function emitDemotion(taskClass, rate, opts) {
  const emit = opts.emit || defaultEmit;
  try {
    emit({ event: 'fleet-dev-class-mis-profiled', tier2_anneal: true, task_class: taskClass,
      escalation_rate: rate, action: 'demote', reprofile_signal: true, ts: opts.now ? opts.now() : null });
  } catch { /* telemetry is best-effort, never blocks the transition */ }
}

// Apply hysteresis. Returns { status, transition, rate }. On a transition the window resets so the new
// mode is judged on FRESH data (prevents oscillation; lets a model refresh show through in shadow).
function governClass(state, taskClass, opts = {}) {
  const entry = classEntry(state, taskClass);
  const rate = escalationRate(entry);
  let transition = null;
  if (rate !== null && entry.status === 'promoted' && rate > DEMOTE_AT) transition = 'demote';
  else if (rate !== null && entry.status === 'demoted' && rate < PROMOTE_AT) transition = 're-promote';
  if (transition === 'demote') { entry.status = 'demoted'; entry.window = []; emitDemotion(taskClass, rate, opts); }
  else if (transition === 're-promote') { entry.status = 'promoted'; entry.window = []; }
  return { status: entry.status, transition, rate };
}

// Route verdict the execution path consumes: a promoted class runs on the fleet; a demoted class runs on
// the escalated tier for REAL output but is still SHADOW-run on the fleet (scored) for data-driven re-promotion.
function routeClass(state, taskClass) {
  const entry = classEntry(state, taskClass);
  return { onFleet: entry.status === 'promoted', shadowOnFleet: entry.status === 'demoted', status: entry.status };
}

function defaultEmit(record) {
  if (process.env.MEGINGJORD_NO_TELEMETRY) return; // test/CI opt-out — never write prod telemetry
  const file = resolveTelemetryFile(TELEMETRY); // traversal-safe MEGINGJORD_TELEMETRY_DIR redirect
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, JSON.stringify(record) + '\n'); }
  catch { /* best-effort */ }
}

module.exports = {
  recordOutcome, governClass, escalationRate, routeClass, classEntry,
  WINDOW_N, MIN_SAMPLE, DEMOTE_AT, PROMOTE_AT,
};
