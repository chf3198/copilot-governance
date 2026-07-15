'use strict';
// baton-back-set.js (Epic #3251, Phase-1 child #3259): the phase-exit wiring that
// persists baton-back state when a review phase surfaces findings. It composes the
// shipped primitives — it does NOT re-route (that is `cross-model-finding-router` ->
// `baton-back.routeRemediation`). For each routed marker it plans:
//   1. a `## BATON_BACK` timeline comment (authoritative, survives context loss),
//   2. a metadata-only ledger event (observability; `baton-back-ledger`),
//   3. the `baton-back:open` + `review-coverage:<grade>` disclosure labels.
const batonBack = require('./baton-back');
const ledger = require('./baton-back-ledger');

// The graded disclosure vocabulary (Phase-0 #3253). Anything outside it is not a
// valid coverage label and is dropped (fail-closed on unknown grades).
const REVIEW_COVERAGE_LABELS = Object.freeze([
  'cross-family-free', 'cross-family-paid', 'same-family-paid',
  'same-model-grounded-paid', 'programmatic-only']);

// Pure: plan the comments/labels/events from a route result (cross-model-finding-router).
function planMarkerSet(routeResult = {}, ticket, coverage) {
  routeResult = routeResult || {};
  const markers = routeResult.markers || [];
  const comments = markers.map((m) => batonBack.serializeMarker(m));
  const labels = [];
  if (markers.length) labels.push('baton-back:open');
  const cov = coverage || routeResult.review;
  if (cov && REVIEW_COVERAGE_LABELS.includes(cov)) labels.push(`review-coverage:${cov}`);
  return { comments, labels, events: markers, ticket: Number(ticket) || null,
    open: markers.length > 0 };
}

// Apply the plan via injected side-effect fns. deps: {postComment, setLabels,
// appendEvent, coverage, ledgerOpts}. Defaults are no-ops / the real ledger, so a
// caller supplies only the gh-facing bits. Never throws on a best-effort ledger miss.
async function applyMarkerSet(routeResult, ticket, deps = {}) {
  const plan = planMarkerSet(routeResult, ticket, deps.coverage);
  const post = deps.postComment || (async () => {});
  const setLabels = deps.setLabels || (async () => {});
  const append = deps.appendEvent || ledger.appendEvent;
  for (const body of plan.comments) await post(ticket, body);
  for (const marker of plan.events) append(ticket, marker, deps.ledgerOpts || {});
  if (plan.labels.length) await setLabels(ticket, plan.labels);
  return plan;
}

module.exports = { REVIEW_COVERAGE_LABELS, planMarkerSet, applyMarkerSet };
