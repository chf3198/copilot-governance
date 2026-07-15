'use strict';
// Pure-JS Kolmogorov-Smirnov 2-sample test. Asymptotic approximation
// sufficient for cross-team R&D wave-decision counts (typical N=5-30).
// Refs Epic #1112 AC4 (#2405) + protocol v3 §5 termination per #2396.
//
// Reference: Wikipedia Kolmogorov-Smirnov; Numerical Recipes §14.3.
// Validated against scipy.stats.ks_2samp on synthetic uniform/normal data.

function empiricalCdf(sortedSamples, x) {
  let lo = 0, hi = sortedSamples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedSamples[mid] <= x) lo = mid + 1; else hi = mid;
  }
  return lo / sortedSamples.length;
}

function ks2Sample(sample1, sample2) {
  if (!Array.isArray(sample1) || !Array.isArray(sample2)) {
    throw new Error('ks2Sample: both inputs must be arrays');
  }
  if (sample1.length === 0 || sample2.length === 0) {
    throw new Error('ks2Sample: both inputs must be non-empty');
  }
  const s1 = [...sample1].sort((a, b) => a - b);
  const s2 = [...sample2].sort((a, b) => a - b);
  const merged = [...new Set([...s1, ...s2])].sort((a, b) => a - b);
  let maxDeviation = 0;
  for (const sampleValue of merged) {
    const diff = Math.abs(empiricalCdf(s1, sampleValue) - empiricalCdf(s2, sampleValue));
    if (diff > maxDeviation) maxDeviation = diff;
  }
  const n1 = s1.length, n2 = s2.length;
  const en = Math.sqrt((n1 * n2) / (n1 + n2));
  const lam = (en + 0.12 + 0.11 / en) * maxDeviation;
  const pValue = 2 * Math.exp(-2 * lam * lam);
  return { ks_statistic: maxDeviation, p_value: Math.min(1, pValue) };
}

module.exports = { ks2Sample, empiricalCdf };
