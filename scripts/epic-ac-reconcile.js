'use strict';
// Refs #1289 — AC reconciler emitting per-AC JSON truth-status (CX schema + CC evidence_provenance).
// Default mode: REPORT-ONLY (emit JSON; do not mutate Epic). Promote to write-back after 2-week
// shadow on <2% false-positive metric (Epic #1271 AC10).

const { parseEpicAcs } = require('./closeout-rescope-parser');

const EVIDENCE_RANK = {
  native_github_api: 1.0,
  closed_child: 0.8,
  file_existence: 0.6,
  sensor_output: 0.4,
  heuristic: 0.2,
};

function consensus(provenance) {
  if (!provenance.length) return { vote: 'unknown', score: 0 };
  const tally = {};
  for (const entry of provenance) {
    tally[entry.vote] = (tally[entry.vote] || 0) + (entry.weight || 0);
  }
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  return { vote: sorted[0][0], score: sorted[0][1] };
}

function statusFromConsensus(con, hasMeasuringLabel) {
  if (hasMeasuringLabel) return 'MEASURING';
  if (con.vote === 'satisfied' && con.score >= READY_THRESHOLD) return 'READY_TO_CLOSE';
  if (con.vote === 'unmet') return 'UNMET';
  return 'UNKNOWN';
}

const HEURISTIC_FALLBACK_WEIGHT = 0.1;
const MANUAL_ASSERTION_WEIGHT = 0.6;
const READY_THRESHOLD = 0.6;

function reconcileOne(ac, evidence, opts) {
  const provenance = (evidence || []).map(item => ({
    vote: item.vote,
    weight: item.weight ?? EVIDENCE_RANK[item.source] ?? HEURISTIC_FALLBACK_WEIGHT,
    source: item.source,
  }));
  if (ac.checked && !provenance.length) {
    provenance.push({ vote: 'satisfied', weight: MANUAL_ASSERTION_WEIGHT, source: 'manual_assertion' });
  }
  const con = consensus(provenance);
  const truth_status = statusFromConsensus(con, opts.hasMeasuringLabel);
  return {
    ac_id: ac.id,
    text: ac.text || null,
    checked: ac.checked,
    evidence_refs: provenance.map(p => p.source),
    child_refs: opts.child_refs || [],
    dep_refs: opts.dep_refs || [],
    measuring_until: opts.measuring_until || null,
    rescope_ref: opts.rescope_ref || null,
    evidence_provenance: provenance,
    consensus: con.vote,
    truth_status,
  };
}

function reconcileEpic({ body, evidenceCatalog = {}, hasMeasuringLabel = false, rescopeMap = {} }) {
  const acs = parseEpicAcs(body);
  return acs.map(ac => reconcileOne(ac, evidenceCatalog[ac.id], {
    hasMeasuringLabel,
    rescope_ref: rescopeMap[ac.id] || null,
    child_refs: (evidenceCatalog[ac.id] || []).filter(e => e.source === 'closed_child').map(e => e.ref),
    dep_refs: (evidenceCatalog[ac.id] || []).filter(e => e.source === 'native_github_api').map(e => e.ref),
  }));
}

function epicReadyToClose(reconciled) {
  return reconciled.every(r => r.truth_status === 'READY_TO_CLOSE' || r.truth_status === 'MEASURING' || r.rescope_ref);
}

module.exports = { reconcileEpic, reconcileOne, consensus, epicReadyToClose, EVIDENCE_RANK };
