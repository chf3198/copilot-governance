'use strict';
// anneal-decision-backstop — demotes the #1855 SessionEnd audit from the PRIMARY recognition check
// to the BACKSTOP for the per-review-point checkpoint (Epic #3425 P1-e). ONE flaw-capture model,
// two firing points: the per-review-point checkpoint (review-point-checkpoint.js) is primary; this
// SessionEnd reconciliation catches review-points that crashed mid-baton or bypassed the builder.
//
// Same detector core (anneal-decision-detector.js) — no second recognition model. The reconciliation
// is: for every checkpoint run-event observed this session, was there a baton artifact whose
// flaws_recognized: block disposed of the candidates that checkpoint surfaced? A checkpoint with no
// matching artifact (crashed/bypassed baton) or an artifact that never disposed is reported. Stays
// ADVISORY (matches #1855 current behaviour).

const { evaluate } = require('./anneal-decision-detector');

const CHECKPOINT_PATTERN_ID = 'review-point-checkpoint';

// Extract the checkpoint run-events from a list of incidents.jsonl rows (already parsed).
function checkpointEvents(rows) {
  return (rows || []).filter((row) => row && row.event === 'governance.friction'
    && row.pattern_id === CHECKPOINT_PATTERN_ID);
}

// True when an artifact body for `surface` shows a disposed flaws_recognized block (not a bare none
// when candidates were surfaced). We treat a present, non-empty flaws_recognized block OR a bare
// `none` (when the checkpoint surfaced zero) as disposed; the strict none-vs-candidate rule is the
// P1-f reconciler — here we only catch the crashed/never-disposed case.
function disposed(body) {
  if (typeof body !== 'string') return false;
  return /flaws_recognized\s*:/i.test(body);
}

// Reconcile surfaced (checkpoint events) vs disposed (artifact bodies). Returns advisory findings.
// artifactsBySurface: { 'review-point:<transition>': '<artifact body>' }.
function reconcileSurfacedVsDisposed(rows, artifactsBySurface = {}) {
  const findings = [];
  for (const event of checkpointEvents(rows)) {
    const surface = event.surface || '';
    const body = artifactsBySurface[surface];
    if (body === undefined) {
      findings.push({ rule: 'review-point-no-artifact', severity: 'advisory',
        detail: `checkpoint at ${surface} surfaced candidates but no baton artifact disposed them (crashed/bypassed baton).` });
    } else if (!disposed(body)) {
      findings.push({ rule: 'review-point-undisposed', severity: 'advisory',
        detail: `artifact for ${surface} has no flaws_recognized disposition for the surfaced candidates.` });
    }
  }
  return findings;
}

// Backstop audit over a full-session transcript: the existing #1855 recognition-vs-decision balance
// (reused detector core) PLUS the surfaced-vs-disposed reconciliation. Advisory result.
function backstopAudit(transcript, opts = {}) {
  const recognition = evaluate(transcript, opts);
  const reconcile = reconcileSurfacedVsDisposed(opts.incidentRows || [], opts.artifactsBySurface || {});
  return {
    ok: recognition.ok && reconcile.length === 0,
    recognition,
    reconcile,
    unmatched_recognitions: recognition.unmatched_recognitions,
    review_point_findings: reconcile.length,
  };
}

// Map baton artifacts in a transcript to their review-point surface (review-point:<role>), so the
// SessionEnd backstop can match each checkpoint run-event to the artifact that should have disposed it.
const ARTIFACT_ROLE = [
  [/##\s*MANAGER_HANDOFF\b/i, 'manager'],
  [/##\s*COLLABORATOR_HANDOFF\b/i, 'collaborator'],
  [/##\s*ADMIN_HANDOFF\b/i, 'admin'],
  [/##\s*CONSULTANT_CLOSEOUT\b/i, 'consultant'],
];
function artifactsBySurfaceFromTranscript(transcript) {
  const text = String(transcript || '');
  const blocks = text.split(/(?=##\s*(?:MANAGER_HANDOFF|COLLABORATOR_HANDOFF|ADMIN_HANDOFF|CONSULTANT_CLOSEOUT)\b)/i);
  const bySurface = {};
  for (const block of blocks) {
    for (const [re, role] of ARTIFACT_ROLE) {
      if (re.test(block)) { bySurface[`review-point:${role}`] = block; break; }
    }
  }
  return bySurface;
}

// CLI: read transcript from stdin, read incidents.jsonl, run the backstop audit, print JSON.
function readIncidentRows(file) {
  const fs = require('fs');
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

if (require.main === module) {
  const os = require('os');
  const path = require('path');
  const incidentsPath = process.env.INCIDENTS_PATH
    || path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
  let transcript = '';
  try { transcript = require('fs').readFileSync(0, 'utf8'); } catch { transcript = ''; }
  const result = backstopAudit(transcript, {
    skipRecordedScan: true,
    incidentRows: readIncidentRows(incidentsPath),
    artifactsBySurface: artifactsBySurfaceFromTranscript(transcript),
  });
  process.stdout.write(JSON.stringify(result));
}

module.exports = { reconcileSurfacedVsDisposed, checkpointEvents, backstopAudit, disposed,
  artifactsBySurfaceFromTranscript, CHECKPOINT_PATTERN_ID };
