'use strict';
// cross-model-finding-router.js (Epic #3251, Phase-1 child #3258): the Layer-B
// adapter. It parses machine-readable cross-model review findings and turns each
// BLOCKING finding into a baton-back marker via the SHIPPED router
// (`baton-back.routeRemediation`/`openMarker`, #3257) — it does NOT re-implement
// routing. Deterministic, dependency-free, and hardened against adversarial /
// malformed model output (never throws, never mints a false marker).

const batonBack = require('./baton-back');

// A structured finding is model-friendly snake_case. We translate its flags to
// the camelCase flag set `routeRemediation` consumes. Only these five flags
// decide the route; everything else is provenance carried onto the marker.
function toRoutingFlags(finding = {}) {
  finding = finding || {};
  return {
    environmental: Boolean(finding.environmental),
    touchesFile: Boolean(finding.touches_file),
    governanceMetadata: Boolean(finding.governance_metadata),
    ownArtifactOrGitOp: Boolean(finding.own_artifact_or_git_op),
    currentRole: finding.current_role || null,
  };
}

// Accept an object, a JSON string, or model text with a fenced ```json block.
// Returns the findings array; garbage in yields [] (fail-closed, never throws).
function parseFindings(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const text = fenced ? fenced[1] : raw;
    try { obj = JSON.parse(text.trim()); } catch { return []; }
  }
  if (Array.isArray(obj)) return obj.filter((f) => f && typeof f === 'object');
  if (obj && Array.isArray(obj.findings)) {
    return obj.findings.filter((f) => f && typeof f === 'object');
  }
  return [];
}

function reviewCoverageOf(raw) {
  if (raw && typeof raw === 'object' && typeof raw.review_coverage === 'string') {
    return raw.review_coverage;
  }
  return null;
}

// Route every parsed finding. A non-blocking finding is recorded but produces no
// marker (advisory). A blocking finding produces exactly one open baton-back
// marker, routed deterministically by the shipped router.
function routeFindings(raw, meta = {}) {
  meta = meta || {};
  const findings = parseFindings(raw);
  const review = meta.review || reviewCoverageOf(raw);
  const markers = [];
  const skipped = [];
  for (const finding of findings) {
    if (!finding.blocking) { skipped.push(finding.id || null); continue; }
    const flags = toRoutingFlags(finding);
    const marker = batonBack.openMarker(flags, {
      source: meta.source || 'layerB',
      detector: finding.detector || meta.detector || 'cross-model-review',
      finding_ref: finding.id || meta.finding_ref || null,
      lesson: finding.summary || finding.lesson || null,
      grounding: meta.grounding || finding.grounding || 'none',
      review,
    });
    markers.push(marker);
  }
  return { markers, routed: markers.length, skipped, review };
}

module.exports = { parseFindings, toRoutingFlags, reviewCoverageOf, routeFindings };
