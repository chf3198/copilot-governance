'use strict';
// baton-back.js (Epic #3251, Phase-1 child #3257): the baton-back state primitive.
//
// Records a remediation routing decision when a review phase surfaces an issue,
// enforces the close-gate invariant (a ticket cannot close while remediation is
// open), and bounds the remediation loop with a NON-blocking escalation. Pure,
// dependency-free, and deterministic so it enforces for $0 and survives context
// loss (the authoritative copy is mirrored to the server-side issue/PR timeline).
//
// Routing authority: the Phase-0 identification matrix (#3252).

const DEFAULT_MAX_CYCLES = 3;

// Deterministic remediation routing — no LLM, no instructions.
// `finding` carries mutually-considered flags describing what a fix would touch:
//   { touchesFile, ownArtifactOrGitOp, governanceMetadata, environmental, currentRole }
// Returns { remediator, impact }.
function routeRemediation(finding = {}) {
  finding = finding || {}; // explicit null bypasses the default param
  if (finding.environmental) return { remediator: null, impact: 'override' };
  if (finding.touchesFile) return { remediator: 'collaborator', impact: 'baton-back' };
  if (finding.governanceMetadata) return { remediator: 'manager', impact: 'hold' };
  if (finding.ownArtifactOrGitOp) {
    return { remediator: finding.currentRole || 'current', impact: 'block-in-place' };
  }
  // An unclassified BUT blocking finding must never silently pass: route to a
  // Manager hold so a human-class owner triages it.
  return { remediator: 'manager', impact: 'hold' };
}

// Build an open baton-back marker from a routed finding plus its provenance.
function openMarker(finding = {}, meta = {}) {
  meta = meta || {};
  const { remediator, impact } = routeRemediation(finding);
  return {
    open: true,
    source: meta.source || 'layerA',
    detector: meta.detector || null,
    remediator,
    impact,
    finding_ref: meta.finding_ref || null,
    lesson: meta.lesson || null,
    grounding: meta.grounding || 'none',
    review: meta.review || null,
    cycle: 1,
  };
}

function isOpen(marker) {
  return Boolean(marker && marker.open === true);
}

// The close-gate invariant: a ticket may not reach done/closed while a
// baton-back marker is still open.
function closeGateAllows(marker) {
  return !isOpen(marker);
}

// Clear the marker ONLY when the owning detector re-passes after remediation.
function clearMarker(marker, detectorPassed) {
  if (!isOpen(marker) || !detectorPassed) return marker;
  return { ...marker, open: false };
}

// Bounded, NON-blocking escalation. On exceeding maxCycles the loop neither
// spins forever nor blocks on a timer thread: it escalates to a Tier-2 anneal
// and parks the ticket as deferred for an async client/UAT decision.
function nextCycle(marker, maxCycles = DEFAULT_MAX_CYCLES) {
  marker = marker || {};
  const cycle = (marker.cycle || 1) + 1;
  if (cycle > maxCycles) {
    return {
      ...marker,
      cycle,
      escalate: true,
      escalation: {
        kind: 'tier2-anneal',
        park: 'status:deferred',
        blocking: false,
        pattern_id: 'baton-back-nonconverging',
      },
    };
  }
  return { ...marker, cycle, escalate: false };
}

// ---------------------------------------------------------------------------
// Timeline mirror (authoritative) + local rebuild-by-replay (mirror).
//
// A marker is persisted as a `## BATON_BACK` artifact comment on the issue/PR
// timeline — that server-side copy is authoritative and survives context loss.
// Local state is never trusted as primary: it is *rebuilt* by replaying every
// BATON_BACK comment in chronological order (last-write-wins per detector), so
// a fresh session reconstructs identical open/closed state from the timeline.
const BATON_BACK_HEADER_RE = /(?:^|\n)\s*(?:##\s*)?BATON_BACK\b/i;
const SERIALIZED_FIELDS = ['open', 'source', 'detector', 'remediator', 'impact',
  'finding_ref', 'lesson', 'cycle', 'grounding', 'review'];

function detectorKey(marker) {
  return (marker && marker.detector) || '_default';
}

// Serialize a marker to the canonical BATON_BACK artifact comment body.
function serializeMarker(marker = {}) {
  const lines = ['## BATON_BACK'];
  for (const field of SERIALIZED_FIELDS) {
    if (marker[field] === undefined || marker[field] === null) continue;
    lines.push(`${field}: ${marker[field]}`);
  }
  return lines.join('\n');
}

// Parse one BATON_BACK artifact comment body back into a marker, or null.
function parseMarker(body = '') {
  if (!BATON_BACK_HEADER_RE.test(body || '')) return null;
  const marker = {};
  for (const raw of String(body).split('\n')) {
    const m = raw.match(/^\s*([a-z_]+):\s*(.*)$/i);
    if (!m || !SERIALIZED_FIELDS.includes(m[1])) continue;
    const [, key, value] = m;
    if (key === 'open') marker.open = value.trim() === 'true';
    else if (key === 'cycle') marker.cycle = Number(value.trim()) || 1;
    else marker[key] = value.trim();
  }
  return Object.keys(marker).length ? marker : null;
}

// Rebuild local state by replaying the timeline: chronological last-write-wins
// per detector. `comments` is the ordered issue/PR comment list (the mirror).
function replayMarkers(comments = []) {
  const state = new Map();
  for (const comment of comments || []) {
    const body = typeof comment === 'string' ? comment : (comment && comment.body) || '';
    const marker = parseMarker(body);
    if (marker) state.set(detectorKey(marker), marker);
  }
  return state;
}

// The close-gate invariant over the timeline: true if ANY replayed marker is
// still open. closeout-preflight consults this to block close while open.
function anyOpen(comments = []) {
  for (const marker of replayMarkers(comments).values()) {
    if (isOpen(marker)) return true;
  }
  return false;
}

module.exports = {
  DEFAULT_MAX_CYCLES,
  routeRemediation,
  openMarker,
  isOpen,
  closeGateAllows,
  clearMarker,
  nextCycle,
  serializeMarker,
  parseMarker,
  replayMarkers,
  anyOpen,
};
