'use strict';
// review-point-checkpoint — the per-review-point flaw-capture checkpoint (Epic #3425 P1-b).
//
// A review-point is any baton handoff/transition. At build time (the baton-artifact-builder seam)
// this checkpoint (1) reads the friction candidate feed accumulated since the previous review-point
// from incidents.jsonl, keyed by session + window; (2) surfaces those candidates so the role must
// dispose of each in its flaws_recognized: block; and (3) emits ONE checkpoint run-event per
// review-point via the existing friction_event schema (surface = review-point:<role-transition>),
// so a MISSING checkpoint at a review-point is itself detectable by the #1855 SessionEnd backstop
// (P1-e). SHIPS ADVISORY: it never blocks the build; emission is best-effort.
//
// The AC-R4 asserted-vs-observed probes (P1-c #3430) plug in via opts.probes — absent here, the
// checkpoint surfaces only the incidents feed.

const os = require('os');
const path = require('path');
const fs = require('fs');
const { emitFriction } = require('./friction-event');

const INCIDENTS_FILE = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const CHECKPOINT_PATTERN_ID = 'review-point-checkpoint';
const FRICTION_EVENT = 'governance.friction';

// Read friction candidates from incidents.jsonl for this review-point window: tier-1 friction rows
// at or after sinceTs (and not the checkpoint's own run-events). Malformed rows are skipped.
function collectCandidates(opts = {}) {
  const file = opts.incidentsPath || INCIDENTS_FILE;
  const sinceTs = opts.sinceTs ? Date.parse(opts.sinceTs) : 0;
  let lines;
  try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); }
  catch { return []; }
  const candidates = [];
  for (const line of lines) {
    let row;
    try { row = JSON.parse(line); } catch { continue; } // chaos-tolerant: skip malformed rows
    if (row.event !== FRICTION_EVENT || row.tier !== 1) continue;
    if (row.pattern_id === CHECKPOINT_PATTERN_ID) continue; // never surface our own run-events
    const ts = Date.parse(row.ts || '');
    if (Number.isFinite(sinceTs) && Number.isFinite(ts) && ts < sinceTs) continue;
    candidates.push({ pattern_id: row.pattern_id, severity: row.severity || 'low',
      surface: row.surface || null, detail: row.detail || null, ts: row.ts || null });
  }
  return candidates;
}

// Epic #3425 P1-c: run the F6 asserted-vs-observed probes against the artifact body, if one was
// provided. Returns F6 contradiction candidates ([] when no body / probes unavailable / error).
function runArtifactProbes(input = {}) {
  if (!input.artifactBody) return [];
  try {
    const { runProbes } = require('./asserted-vs-observed-probes');
    return runProbes(input.artifactBody, { mainRef: input.mainRef, cwd: input.cwd }).candidates;
  } catch { return []; } // probes are advisory; never block the checkpoint
}

// Run the checkpoint for a review-point: collect candidates (feed + any injected probe candidates),
// emit one run-event, and return the surfaced set for the role to dispose of. Never throws.
function runCheckpoint(input = {}) {
  const transition = String(input.transition || input.role || 'unknown');
  const surface = `review-point:${transition}`;
  const feed = collectCandidates({ incidentsPath: input.incidentsPath, sinceTs: input.sinceTs });
  const probeCandidates = Array.isArray(input.probeCandidates) ? input.probeCandidates : [];
  // Epic #3425 P1-c: when the artifact body is available, run the asserted-vs-observed (F6) probes
  // and surface their contradiction candidates too. Best-effort + advisory: probe failure is ignored.
  const probed = runArtifactProbes(input);
  const candidates = [...feed, ...probeCandidates, ...probed];
  let event = null;
  try {
    event = emitFriction(CHECKPOINT_PATTERN_ID, {
      severity: 'low', surface, role: input.role || null, team: input.team, runtime: input.runtime,
      detail: `checkpoint at ${surface}: surfaced ${candidates.length} candidate(s)`,
    }, { file: input.incidentsPath, now: input.now });
  } catch { event = null; } // best-effort observability; a failed emit must never block a build
  return { surface, candidates, surfacedCount: candidates.length, event };
}

// Convenience for the builder seam: run the checkpoint only when explicitly enabled, swallowing all
// errors so the deterministic build path is never affected.
function maybeRunCheckpoint(input = {}) {
  if (process.env.FLAW_CAPTURE_DISABLED === '1') return null; // Epic rollback no-op
  try { return runCheckpoint(input); } catch { return null; }
}

module.exports = {
  collectCandidates, runCheckpoint, maybeRunCheckpoint,
  CHECKPOINT_PATTERN_ID, INCIDENTS_FILE,
};
