// tier: 3
// Critic-calibration loop (#2799 P1-6 of Epic #2791; design D11). Tracks whether the cross-family critic
// (#2797) is still trustworthy: its PRECISION vs human-validated escalations, the prove-it test-ACCEPTANCE
// rate, and verdict DRIFT after a model refresh. Degradation (precision/acceptance below floor, or drift
// above the ceiling) → a Tier-2 anneal + a recalibrate signal, so a miscalibrated critic can't keep gating
// merges on noise. Pure: the caller supplies the labelled outcomes; emit is injectable.
'use strict';

const PRECISION_FLOOR = 0.7;   // critic precision TP/(TP+FP) below this → degraded
const ACCEPTANCE_FLOOR = 0.6;  // prove-it re-arms whose generated test was accepted below this → degraded
const DRIFT_CEILING = 0.3;     // fraction of verdicts that flipped post-refresh above this → degraded
const MIN_SAMPLE = 15;         // labelled pairs needed before judging precision (n=5 is statistical noise)
const MIN_PROVEIT_SAMPLES = 3; // re-arm outcomes needed before judging acceptance (don't trip on one lucky pass)
const MIN_DRIFT_SAMPLES = 3;   // shared change-ids needed before judging post-refresh drift

const isBool = (value) => typeof value === 'boolean';

// Confusion stats from [{criticFlag, humanFlag}] booleans (did the critic / the human flag a real problem?).
function calibrationStats(pairs) {
  const valid = (Array.isArray(pairs) ? pairs : []).filter((pair) => pair && isBool(pair.criticFlag) && isBool(pair.humanFlag));
  const count = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const pair of valid) {
    if (pair.criticFlag && pair.humanFlag) count.tp += 1;
    else if (pair.criticFlag && !pair.humanFlag) count.fp += 1;
    else if (!pair.criticFlag && pair.humanFlag) count.fn += 1;
    else count.tn += 1;
  }
  const precision = count.tp + count.fp > 0 ? count.tp / (count.tp + count.fp) : null;
  const recall = count.tp + count.fn > 0 ? count.tp / (count.tp + count.fn) : null;
  return { ...count, precision, recall, n: valid.length };
}

// Fraction of re-arm outcomes whose generated test was ACCEPTED (a low rate = prove-it producing junk tests).
function acceptanceRate(outcomes) {
  const valid = (Array.isArray(outcomes) ? outcomes : []).filter((outcome) => outcome && isBool(outcome.accepted));
  if (valid.length === 0) return null;
  return valid.filter((outcome) => outcome.accepted).length / valid.length;
}

// Fraction of verdicts that FLIPPED between a baseline and a post-refresh run on the SAME change-ids (drift).
// Own-property reads only; an absent current verdict counts as a flip (the refresh stopped producing one).
function verdictDrift(baseline, current) {
  const owns = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
  const keys = baseline ? Object.keys(baseline) : [];
  if (keys.length === 0) return null;
  const flipped = keys.filter((key) => !owns(current, key) || current[key] !== baseline[key]).length;
  return flipped / keys.length;
}

// AC3 detect: degraded if precision/acceptance below floor (with >= MIN_SAMPLE) or drift above ceiling.
function detectCriticDrift({ pairs, proveItOutcomes, baselineVerdicts, currentVerdicts } = {}, opts = {}) {
  const stats = calibrationStats(pairs);
  const acceptance = acceptanceRate(proveItOutcomes);
  const drift = verdictDrift(baselineVerdicts, currentVerdicts);
  const proveItN = (Array.isArray(proveItOutcomes) ? proveItOutcomes : []).filter((outcome) => outcome && isBool(outcome.accepted)).length;
  const driftN = baselineVerdicts ? Object.keys(baselineVerdicts).length : 0;
  // Each check is 'ok' | 'degraded' | 'insufficient-data'. CRUCIALLY 'insufficient-data' is NOT 'ok': a broken
  // metric pipeline (e.g. the prove-it runner stops emitting) must surface as UNKNOWN so the caller can
  // fail-safe (latch a prior degraded state until fresh positive evidence clears it) — never read as healthy.
  const status = {
    precision: stats.n < MIN_SAMPLE || stats.precision === null ? 'insufficient-data' : (stats.precision >= PRECISION_FLOOR ? 'ok' : 'degraded'),
    acceptance: acceptance === null || proveItN < MIN_PROVEIT_SAMPLES ? 'insufficient-data' : (acceptance >= ACCEPTANCE_FLOOR ? 'ok' : 'degraded'),
    drift: drift === null || driftN < MIN_DRIFT_SAMPLES ? 'insufficient-data' : (drift <= DRIFT_CEILING ? 'ok' : 'degraded'),
  };
  const reasons = [];
  if (status.precision === 'degraded') reasons.push('precision-below-floor');
  if (status.acceptance === 'degraded') reasons.push('proveit-acceptance-below-floor');
  if (status.drift === 'degraded') reasons.push('post-refresh-verdict-drift');
  const degraded = reasons.length > 0;
  const insufficientData = Object.values(status).some((value) => value === 'insufficient-data');
  if (degraded && opts.emit) {
    try { opts.emit({ event: 'fleet-dev-critic-degraded', tier2_anneal: true, reasons, action: 'recalibrate' }); }
    catch { /* best-effort */ }
  }
  return { degraded, insufficientData, status, reasons, precision: stats.precision, acceptance, drift,
    actions: degraded ? ['emit-anneal', 'recalibrate'] : [] };
}

module.exports = {
  calibrationStats, acceptanceRate, verdictDrift, detectCriticDrift,
  PRECISION_FLOOR, ACCEPTANCE_FLOOR, DRIFT_CEILING, MIN_SAMPLE, MIN_PROVEIT_SAMPLES, MIN_DRIFT_SAMPLES,
};
