'use strict';
// review-coverage-resolver.js (Epic #3251, Phase-1 child #3260): thin wiring over
// the SHIPPED substrate scripts. It resolves the graded `review-coverage:*`
// disclosure (Phase-0 #3253 design) at a review point, with a 300s-TTL
// reachability cache so repeated review points do not re-probe. It does NOT
// rebuild the cascade / stakes / degradation engines — it composes them:
//   reviewer selection + budget tiering -> review-stakes-router.routeReview
//   model-capability registry (thinking-flag/tok-s)  -> cross-referenced to #3126
// The graded ladder (best -> floor): cross-family-free | cross-family-paid |
// same-family-paid | same-model-grounded-paid | programmatic-only.
const stakes = require('./review-stakes-router');

const DEFAULT_TTL_MS = 300000; // 300s — matches the design's live-failover cache.
const _reach = new Map(); // provider -> { ts, reachable } (module-level probe cache)

// Pure map from a resolved reviewer + reachability to a coverage rung.
function gradeCoverage({ authorFamily, reviewerFamily, tier, reachable, grounded }) {
  if (!reachable) return 'programmatic-only';
  const crossFamily = reviewerFamily && reviewerFamily !== authorFamily;
  const paid = tier === 'premium';
  if (crossFamily) return paid ? 'cross-family-paid' : 'cross-family-free';
  if (grounded) return 'same-model-grounded-paid';
  return 'same-family-paid';
}

// Cached reachability probe (injectable). TTL default 300s; `now`/`prober` injected for tests.
function probeReachable(provider, { now = Date.now, ttlMs = DEFAULT_TTL_MS, prober } = {}) {
  const cached = _reach.get(provider);
  const nowMs = now();
  if (cached && nowMs - cached.ts < ttlMs) return cached.reachable;
  const reachable = prober ? Boolean(prober(provider)) : true;
  _reach.set(provider, { ts: nowMs, reachable });
  return reachable;
}

function clearCache() { _reach.clear(); }

// Resolve the coverage grade + disclosure for a review point. `budgetAllowsPaid`
// is the G2>G3 paid-floor authorization (default: paid on lane:code-change).
// Honest floor: a premium reviewer that budget forbids collapses to
// programmatic-only AND raises a client-UAT warning (never a silent skip).
function resolveCoverage(opts = {}) {
  const { paths = [], labels = [], authorFamily = 'anthropic',
    budgetAllowsPaid = true, grounded = false, now, ttlMs, prober } = opts;
  const reviewer = stakes.routeReview({ paths, labels, authorFamily });
  const paid = reviewer.tier === 'premium';
  if (paid && !budgetAllowsPaid) {
    return { review_coverage: 'programmatic-only', reviewer, escalate_client_uat: true,
      reason: 'paid-floor-unbudgeted' };
  }
  const reachable = probeReachable(reviewer.provider, { now, ttlMs, prober });
  const review_coverage = gradeCoverage({
    authorFamily, reviewerFamily: reviewer.family, tier: reviewer.tier, reachable, grounded });
  return {
    review_coverage, reviewer, escalate_client_uat: review_coverage === 'programmatic-only',
    reason: reachable ? 'resolved' : 'reviewer-unreachable',
  };
}

module.exports = { gradeCoverage, probeReachable, resolveCoverage, clearCache, DEFAULT_TTL_MS };
