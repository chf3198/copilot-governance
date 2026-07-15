'use strict';
// backlog-relevance-sweep (#3420, Epic #3398 C2) — pure logic for the opt-in
// `--semantic` cross-model lane on governance-drift-sweep.js (#2981). Flags
// likely-superseded dormant backlog tickets with cited shipped-artifact evidence.
// Deterministic default path stays $0 (no model call); the semantic lane is
// fleet-first (dispatch orchestration lives in backlog-relevance-lane.js). This
// module owns candidate selection, embedding pre-filter, median-of-N + minority-
// veto aggregation, evidence-binding validation, and the C1 inbound sequencing
// gate (research §2/§2.1/§5). No IO, no model calls — all injectable.

// --- Candidate selection (AC2) ------------------------------------------------
// Base pool = D5/D6 dormant-backlog subset (reuse the sweep classifier). Velocity-
// relative: rank by recency ascending (most-dormant first), keep the bottom
// `quantile` fraction — NO calendar threshold. `--force-scan` returns the whole pool.
function selectCandidates(issues, opts = {}) {
  const classify = opts.classify || (() => []);
  const recencyOf = opts.recencyOf || (() => 0);
  const quantile = typeof opts.quantile === 'number' ? Math.min(Math.max(opts.quantile, 0), 1) : 0.5;
  const byNumber = new Map((Array.isArray(issues) ? issues : []).map((i) => [i.number, i]));
  const pool = (Array.isArray(issues) ? issues : []).filter((i) => {
    const cls = classify(i, byNumber) || [];
    return cls.includes('D5') || cls.includes('D6');
  });
  if (opts.forceScan) return pool;
  if (pool.length <= 1) return pool;
  const sorted = [...pool].sort((a, b) => recencyOf(a) - recencyOf(b)); // oldest first
  const keep = Math.max(1, Math.ceil(sorted.length * quantile));
  return sorted.slice(0, keep);
}

// --- Embedding pre-filter (AC2) -----------------------------------------------
function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return -Infinity;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return -Infinity;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Rank candidates by cosine similarity to a goal-query vector before any verdict.
// Graceful: null query or all-null embeddings → identity order (no model needed).
function rankByEmbedding(candidates, queryVec, embedOf = () => null) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!Array.isArray(queryVec) || !queryVec.length) return list;
  const scored = list.map((c) => ({ c, s: cosine(queryVec, embedOf(c)) }));
  if (scored.every((x) => x.s === -Infinity)) return list;
  return scored.sort((x, y) => y.s - x.s).map((x) => x.c);
}

// --- Verdict aggregation (AC3): median-of-N + minority-veto -------------------
function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// verdicts: [{ superseded:bool, score:0..1 }]. Any non-superseded dissent VETOES the
// superseded call (a wrong cancel is worse than a missed one — research §5). Empty/
// degraded input fails closed to `relevant`.
function aggregateVerdict(verdicts) {
  const votes = (Array.isArray(verdicts) ? verdicts : []).filter((x) => x && typeof x.score === 'number');
  if (!votes.length) return { label: 'relevant', medianScore: 0, n: 0, veto: false };
  const medianScore = median(votes.map((x) => x.score));
  const allSuperseded = votes.every((x) => x.superseded === true);
  const anySuperseded = votes.some((x) => x.superseded === true);
  const veto = anySuperseded && !allSuperseded;
  const label = allSuperseded ? 'superseded' : (anySuperseded ? 'partial' : 'relevant');
  return { label, medianScore, n: votes.length, veto };
}

// --- Evidence-binding validation (AC3) ---------------------------------------
// Acyclic transitive-chain check: the supersession chain must not loop and must
// terminate at artifact_id (reuses the DAG-guard idea from superseded-resolution).
function chainAcyclic(chain, terminal) {
  if (chain == null) return true;
  if (!Array.isArray(chain)) return false;
  const seen = new Set();
  for (const node of chain) { if (seen.has(node)) return false; seen.add(node); }
  return chain.length === 0 || String(chain[chain.length - 1]) === String(terminal);
}

function validateEvidence(payload) {
  const ev = payload || {};
  if (ev.artifact_id == null || String(ev.artifact_id) === '') return { valid: false, reason: 'missing artifact_id' };
  if (typeof ev.contribution_score !== 'number' || ev.contribution_score < 0 || ev.contribution_score > 1) {
    return { valid: false, reason: 'contribution_score out of [0,1]' };
  }
  if (!ev.rationale || !String(ev.rationale).trim()) return { valid: false, reason: 'missing rationale' };
  if (!chainAcyclic(ev.chain, ev.artifact_id)) return { valid: false, reason: 'transitive-chain cyclic or non-terminal' };
  return { valid: true, reason: 'ok' };
}

// --- Inbound sequencing gate (AC4) -------------------------------------------
// A ticket with LIVE inbound pointers can only be PARTIAL, never superseded — the
// sweep must never create the orphans C1 (#3419) exists to catch.
function classifyFlag({ verdict, inboundOrphans, evidence } = {}) {
  const orphans = Array.isArray(inboundOrphans) ? inboundOrphans : [];
  if (orphans.length > 0) return { flag: 'partial', reason: `live inbound pointers from ${orphans.map((o) => `#${o.from}`).join(',')}` };
  if (!verdict || verdict.label !== 'superseded') return { flag: (verdict && verdict.label) || 'relevant', reason: 'verdict' };
  const ev = evidence || { valid: false, reason: 'no evidence' };
  if (!ev.valid) return { flag: 'partial', reason: `evidence-guard: ${ev.reason}` };
  return { flag: 'superseded', reason: 'confirmed superseded with bound evidence + no live inbound' };
}

// G4: redact any ticket text before it leaves the machine for a model.
function redactForDispatch(text, redactString) {
  return typeof redactString === 'function' ? redactString(String(text || '')) : String(text || '');
}

module.exports = {
  selectCandidates, cosine, rankByEmbedding, median, aggregateVerdict,
  chainAcyclic, validateEvidence, classifyFlag, redactForDispatch,
};
