'use strict';
// cross-model-review-dispatch.js (Epic #3251, Phase-1 child #3258): the Layer-B
// review adapter that the post-merge audit workflow calls (it operationalizes the
// prior inert placeholder). It COMPOSES shipped pieces, adding no new engine:
//   coverage grade + honest floor -> review-coverage-resolver (#3260)
//   fleet -> free-cloud dispatch  -> cascade-dispatch (#2621)
//   finding -> marker routing     -> cross-model-finding-router (#3258 D1)
// Degrades to `programmatic-only` (findings=[]) whenever no model is reachable —
// it NEVER hard-fails, so the advisory workflow stays green (G6).
const resolver = require('./review-coverage-resolver');
const { routeFindings } = require('./cross-model-finding-router');

// Default production dispatcher: cascade (fleet -> free-cloud -> advisory). Lazily
// required so unit tests that inject `deps.dispatcher` never load the network path.
async function defaultDispatcher(prompt, opts = {}) {
  const { cascade } = require('./cascade-dispatch');
  const res = await cascade(prompt, opts);
  return { ok: Boolean(res && res.ok && res.content), content: (res && res.content) || '',
    provider: (res && (res.provider || res.model)) || 'fleet', tier: res && res.tier };
}

const PROGRAMMATIC_ONLY = (extra = {}) => ({
  review_coverage: 'programmatic-only', findings: [],
  route: { markers: [], routed: 0, skipped: [], review: 'programmatic-only' },
  grounding: 'none', escalate_client_uat: true, ...extra });

// Resolve coverage, dispatch the review, and route its findings into markers.
// `deps` injects {resolveCoverage, dispatcher, now, prober} for tests.
async function dispatchReview(opts = {}) {
  const { prompt = '', authorFamily = 'anthropic', paths = [], labels = [],
    budgetAllowsPaid = true, grounding = 'none' } = opts;
  const deps = opts.deps || {};
  const resolve = deps.resolveCoverage || resolver.resolveCoverage;
  const coverage = resolve({ paths, labels, authorFamily, budgetAllowsPaid,
    now: deps.now, prober: deps.prober });
  if (coverage.review_coverage === 'programmatic-only') {
    return PROGRAMMATIC_ONLY({ reviewer: coverage.reviewer, reason: coverage.reason });
  }
  const dispatcher = deps.dispatcher || defaultDispatcher;
  let result;
  try { result = await dispatcher(prompt, deps.dispatchOpts || {}); }
  catch (err) { result = { ok: false, reason: String(err && err.message) }; }
  if (!result || !result.ok || !result.content) {
    return PROGRAMMATIC_ONLY({ reviewer: coverage.reviewer, reason: 'reviewer-empty' });
  }
  const route = routeFindings(result.content, {
    source: 'layerB', review: coverage.review_coverage, grounding });
  return { review_coverage: coverage.review_coverage, findings: route.markers, route,
    reviewer: coverage.reviewer, grounding, escalate_client_uat: false,
    provider: result.provider };
}

module.exports = { dispatchReview, defaultDispatcher, PROGRAMMATIC_ONLY };
