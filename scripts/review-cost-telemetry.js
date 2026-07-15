'use strict';
// tier: 3
// Review-dispatch cost telemetry (#2932 / Epic #2926 C6, design D6). Closes the G8 gap that raw paid
// review calls created: every review dispatch is tagged with tier+stakes, so the free-vs-paid review
// ratio + per-tier p50/p99 latency are measurable and a premium-share governor (>20%/7d) trips an
// anneal on drift. Reuses model-routing-telemetry's append/read; honors MEGINGJORD_NO_TELEMETRY (G4).

const fs = require('fs');
const os = require('os');
const path = require('path');

const PAID_TIERS = new Set(['haiku', 'premium']);
const DEFAULT_PREMIUM_THRESHOLD_PCT = 20;

function isPaid(tier) { return PAID_TIERS.has(tier); }

/** Append a tier+stakes-tagged review row. No-op under MEGINGJORD_NO_TELEMETRY (test/CI isolation). */
function recordReviewDispatch(event = {}, deps = {}) {
  if (process.env.MEGINGJORD_NO_TELEMETRY === '1') return { recorded: false, reason: 'telemetry-disabled' };
  const append = deps.append || require('./model-routing-telemetry').recordTelemetry;
  append({
    lane: event.tier, model: event.model, review: true, stakes: event.stakes,
    paid: isPaid(event.tier), latency_ms: event.latencyMs, outcome: 'ok', execute: true,
  });
  return { recorded: true };
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[idx];
}

/** Pure report over telemetry rows: free-vs-paid ratio + per-tier p50/p99 latency. */
function reviewCostReport(rows = []) {
  const reviews = rows.filter((r) => r && r.review);
  const total = reviews.length;
  const tierOf = (r) => r.lane || r.tier || 'unknown';
  const paid = reviews.filter((r) => isPaid(tierOf(r))).length;
  const free = total - paid;
  const perTier = {};
  for (const r of reviews) {
    const tier = tierOf(r);
    if (!perTier[tier]) perTier[tier] = { count: 0, latencies: [] };
    perTier[tier].count += 1;
    if (Number.isFinite(r.latency_ms)) perTier[tier].latencies.push(r.latency_ms);
  }
  for (const stats of Object.values(perTier)) {
    const sorted = stats.latencies.sort((a, b) => a - b);
    delete stats.latencies;
    stats.p50 = percentile(sorted, 50);
    stats.p99 = percentile(sorted, 99);
  }
  const premiumShare = total ? reviews.filter((r) => tierOf(r) === 'premium').length / total : 0;
  return {
    total, free, paid,
    freeVsPaidRatio: paid ? free / paid : (free ? Infinity : 0),
    freeShare: total ? free / total : 0,
    premiumShare, perTier,
  };
}

/** Premium-share governor: breach when premium review share exceeds the threshold over the window. */
function premiumShareGovernor(rows = [], opts = {}) {
  const thresholdPct = opts.thresholdPct ?? DEFAULT_PREMIUM_THRESHOLD_PCT;
  const { premiumShare, total } = reviewCostReport(rows);
  // Strict `>` is intentional: the #2619 mandate is "premium share EXCEEDS 20%/7d", so exactly 20%
  // does NOT breach. reviewCostReport builds a fresh perTier (no input-row mutation), so repeated
  // calls here are pure/idempotent.
  return { breach: total > 0 && premiumShare * 100 > thresholdPct, premiumShare, thresholdPct, total };
}

/** Emit an anneal incident on governor breach. Injectable sink; default appends to incidents.jsonl. */
function emitGovernorAnneal(result, deps = {}) {
  if (!result || !result.breach) return { emitted: false };
  const event = {
    ts: deps.ts || null, version: 3, service: 'review-cost', env: 'local',
    event: 'premium-share-governor-breach', severity: 'medium',
    pattern_id: 'review-premium-share-exceeds-threshold',
    premium_share: result.premiumShare, threshold_pct: result.thresholdPct,
  };
  const sink = deps.sink || ((ev) => {
    const file = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(ev) + '\n');
  });
  sink(event);
  return { emitted: true, event };
}

/** Wire C5's stakes-router to the telemetry: classify+select, then record tier+stakes. */
function routeAndRecord(input = {}, deps = {}) {
  const route = (deps.routeReview || require('./review-stakes-router').routeReview)(input);
  recordReviewDispatch({ tier: route.tier, stakes: route.stakes, model: route.model, latencyMs: input.latencyMs }, deps);
  return route;
}

module.exports = {
  recordReviewDispatch, reviewCostReport, premiumShareGovernor, emitGovernorAnneal, routeAndRecord,
  isPaid, PAID_TIERS, DEFAULT_PREMIUM_THRESHOLD_PCT,
};
