'use strict';
// anneal-stop — Epic #1568 AC-5 (#1574). Explicit stopping rules for the
// workflow-self-anneal loop. Self-Refine (arXiv 2303.17651) shows refinement
// gain tapers after iter 2; MAR (arXiv 2512.20845) plateaus at iter 5 with
// majority of gain by iter 3. Self-bias amplifies monotonically when the same
// model rates itself across iterations (Panickssery et al. NeurIPS '24/'25),
// so the loop must cap on score-delta too, not just iteration count.
//
// Pure function: no file I/O. Caller wires telemetry via input.telemetrySink.

const MAX_ITERATIONS = 3;
const DELTA_CAP = 0.5;

function shouldStop(input) {
  const i = input || {};
  const iterations = Number.isFinite(i.iterations) ? i.iterations : 0;
  const prev = i.prev_rubric_mean;
  const current = i.current_rubric_mean;
  const gatesOk = Boolean(i.deterministic_gates_ok);

  if (gatesOk) {
    return emit(i, { stop: true, reason: 'gates' });
  }
  if (iterations >= MAX_ITERATIONS) {
    return emit(i, { stop: true, reason: 'iter-cap', iterations });
  }
  if (prev == null || current == null) {
    return emit(i, { stop: false, reason: 'no-prev' });
  }
  const delta = Math.abs(Number(current) - Number(prev));
  if (Number.isFinite(delta) && delta <= DELTA_CAP) {
    return emit(i, { stop: true, reason: 'delta-cap', delta });
  }
  return emit(i, { stop: false, reason: 'continue', delta });
}

function emit(input, decision) {
  const sink = input && input.telemetrySink;
  if (typeof sink === 'function') {
    try { sink({ ...decision, ts: new Date().toISOString() }); } catch (_) { /* ignore */ }
  }
  return decision;
}

module.exports = { shouldStop, MAX_ITERATIONS, DELTA_CAP };
