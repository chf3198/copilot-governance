// tier: 3
// Anti-Goodhart test-quality monitor (#2799 P1-6 of Epic #2791; design D10). Guards G2 from being eroded by
// G3: when the fleet-development-SHARE metric rises while test-QUALITY metrics fall, that's the Goodhart
// signature (share optimized at quality's expense) → trip a Tier-2 anneal AND gate the share metric so it
// can't keep justifying more fleet routing until quality recovers. Velocity-relative window (last N samples,
// never calendar). Pure: the caller owns persistence + supplies the MEASURED metrics; emit is injectable.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { resolveTelemetryFile } = require('./fleet-telemetry-path');

const SAMPLES_LOG = path.join(process.env.HOME || '', '.megingjord', 'fleet-dev-quality.jsonl');
const WINDOW_N = 10;    // judge on the last N change-samples
const MIN_SAMPLE = 4;   // too-few samples → never trip (fail-safe: don't gate on noise)
const QUALITY_WEIGHTS = { coverageDelta: 0.4, mutationScore: 0.4, testCodeComplexityRatio: 0.2 };

const ownNum = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] === 'number';

// Composite quality score from a sample's own-prop metrics. A MISSING metric counts as 0 (conservative —
// an absent measurement reads as low quality so it can't mask a real decline). Ratio is capped at 1.
function qualityScore(sample) {
  const get = (key) => (ownNum(sample, key) ? sample[key] : 0);
  return QUALITY_WEIGHTS.coverageDelta * get('coverageDelta')
    + QUALITY_WEIGHTS.mutationScore * get('mutationScore')
    + QUALITY_WEIGHTS.testCodeComplexityRatio * Math.min(get('testCodeComplexityRatio'), 1);
}

// Direction of a numeric series via least-squares SLOPE (per-sample). A slope catches a slow but CONSISTENT
// decline that a first-vs-second-half mean would hide under the dead-band (a real 0.80→0.77 drift). The
// dead-band is applied to the slope to filter genuine noise. Returns 'up' | 'down' | 'flat'.
function direction(values, deadband = 0.002) {
  if (values.length < 2) return 'flat';
  const count = values.length;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let num = 0;
  let den = 0;
  for (let i = 0; i < count; i += 1) { num += (i - meanX) * (values[i] - meanY); den += (i - meanX) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  return slope > deadband ? 'up' : slope < -deadband ? 'down' : 'flat';
}

// AC1 capture: append one per-change quality sample {share, coverageDelta, mutationScore, ratio}. Best-effort,
// honors MEGINGJORD_NO_TELEMETRY + the traversal-safe redirect (#2885); injectable via opts.emit.
function recordQualitySample(sample, opts = {}) {
  if (opts.emit) { try { opts.emit(sample); } catch { /* best-effort */ } return; }
  if (process.env.MEGINGJORD_NO_TELEMETRY) return;
  const file = resolveTelemetryFile(SAMPLES_LOG);
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, JSON.stringify(sample) + '\n'); }
  catch { /* best-effort */ }
}

// AC2 detect: trip when SHARE trends up while composite QUALITY trends down over >= MIN_SAMPLE recent samples.
function detectGoodhart(window, opts = {}) {
  const recent = (Array.isArray(window) ? window : []).slice(-WINDOW_N);
  if (recent.length < MIN_SAMPLE) return { tripped: false, reason: 'insufficient-sample', samples: recent.length };
  const shareTrend = direction(recent.map((sample) => (ownNum(sample, 'share') ? sample.share : 0)), opts.deadband);
  const qualityTrend = direction(recent.map(qualityScore), opts.deadband);
  return { tripped: shareTrend === 'up' && qualityTrend === 'down', shareTrend, qualityTrend, samples: recent.length };
}

// AC2 guardrail: on a trip, gate the share metric + emit a Tier-2 anneal (G8). Returns the actions taken.
function goodhartGuardrail(window, opts = {}) {
  const detected = detectGoodhart(window, opts);
  if (!detected.tripped) return { ...detected, actions: [] };
  const record = { event: 'fleet-dev-goodhart-trip', tier2_anneal: true, share_trend: detected.shareTrend,
    quality_trend: detected.qualityTrend, action: 'gate-share-metric' };
  if (opts.emit) { try { opts.emit(record); } catch { /* best-effort */ } }
  return { ...detected, actions: ['gate-share-metric', 'emit-anneal'], record };
}

module.exports = {
  qualityScore, direction, recordQualitySample, detectGoodhart, goodhartGuardrail,
  WINDOW_N, MIN_SAMPLE, SAMPLES_LOG,
};
