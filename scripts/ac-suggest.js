'use strict';
// Refs #3329 / Epic #1299 — AI-suggested acceptance criteria with the epic-ac-reconcile.js
// measurability backstop. Free fleet/free-cloud LLM lane (G3) with a deterministic offline
// fallback (G6). The backstop verifies a suggested AC is *measurable* (computable from a known
// evidence source) — NOT that it is the correct requirement. Per Microsoft 2026 "Intent
// Formalization": there is no oracle for spec correctness; the Manager remains the intent oracle
// (HITL). This tool reduces aspirational ACs; it does not auto-validate intent.

const fs = require('fs');
const path = require('path');
const { reconcileEpic } = require('./epic-ac-reconcile');

// The reconciler's evidence taxonomy (EVIDENCE_RANK keys). A suggested AC is measurable iff its
// text anchors to one of these sources.
const EVIDENCE_SOURCES = ['native_github_api', 'closed_child', 'file_existence', 'sensor_output'];

const MEASURE_LOG = process.env.AC_SUGGEST_LOG ||
  path.join(process.env.HOME || '/tmp', '.megingjord', 'ac-suggest-measurements.jsonl');

const DISPATCH_TIMEOUT_MS = 30000; // fleet/free-cloud suggestion call budget

// --- Measurability classifier (the heuristic side of the backstop) ---------------------------
// Maps free-text AC phrasing to a reconciler evidence source, or null when nothing measurable is
// referenced. Order matters: most specific anchor first.
function classifyMeasurability(text) {
  const value = String(text || '');
  if (/#\d+/.test(value)) {
    return { measurable: true, evidence_source: 'closed_child', anchor: (value.match(/#\d+/) || [])[0] };
  }
  const file = value.match(/\b[\w./-]+\.(?:js|ts|py|md|json|ya?ml|sh|css|html)\b/);
  if (file) return { measurable: true, evidence_source: 'file_existence', anchor: file[0] };
  // sensor_output requires an actual NUMBER — a metric word alone ("improve latency") is
  // aspirational, not measurable (cross-family review concern, #1302). Honest FP-avoidance.
  const numericMetric = /(?:\d+\s?%|[<>]=?\s?\d|\bp\d{2}\b|\b\d+\s?(?:ms|s|x|tokens|files|lines|chars|kb|mb)\b)/i.test(value);
  const metricWordWithNumber = /\b(?:rate|ratio|coverage|latency|throughput|score|threshold|budget|count)\b/i.test(value) && /\d/.test(value);
  if (numericMetric || metricWordWithNumber) {
    return { measurable: true, evidence_source: 'sensor_output', anchor: 'metric' };
  }
  // native_github_api: tightened to git/GitHub-specific tokens — avoids matching the common word
  // "check" in "double-check the logic" (would be a false positive).
  if (/(?:\blabel(?:l?ed|s)?\b|pull request|\bmerged\b|issue (?:closed|state|open)|\bCI\b|status:[\w-]+|required check|workflow run)/i.test(value)) {
    return { measurable: true, evidence_source: 'native_github_api', anchor: 'github-state' };
  }
  return { measurable: false, evidence_source: null, anchor: null,
    reason: 'no recognizable evidence anchor (file / #child / metric / github-state) — aspirational' };
}

// --- Reconciler-backstop ----------------------------------------------------------------------
// Render suggestions into Epic-body AC lines, feed a SYNTHETIC evidence catalog (only measurable
// ACs get an evidence entry), and run the real reconciler. Unmeasurable ACs receive no evidence →
// reconciler returns truth_status UNKNOWN → rejected. This wires epic-ac-reconcile.js as the
// authoritative backstop rather than re-implementing its verdict.
function reconcileSuggestions(suggestions) {
  const body = suggestions.map((s, i) => `- [ ] **${s.id || 'AC' + (i + 1)}**: ${s.text}`).join('\n');
  const evidenceCatalog = {};
  suggestions.forEach((s, i) => {
    const id = s.id || 'AC' + (i + 1);
    const cls = classifyMeasurability(s.text);
    const source = s.evidence_source && EVIDENCE_SOURCES.includes(s.evidence_source)
      ? s.evidence_source : cls.evidence_source;
    if (cls.measurable && source) evidenceCatalog[id] = [{ source, vote: 'satisfied' }];
  });
  const reconciled = reconcileEpic({ body, evidenceCatalog });
  // Accept = the reconciler RECOGNIZED an evidence source (consensus !== 'unknown'). We key off
  // recognition, NOT truth_status: the reconciler downgrades low-CONFIDENCE sources (e.g.
  // sensor_output, weight 0.4 < the 0.6 ready-threshold) to UNKNOWN, but a recognized-yet-low-
  // confidence source still means the AC is *measurable* — which is exactly the backstop's question.
  return reconciled.map((r) => ({
    ...r,
    accepted: r.consensus !== 'unknown',
    classifier: classifyMeasurability(r.text || (suggestions.find((s) => s.id === r.ac_id) || {}).text),
  }));
}

function validateSuggestions(suggestions) {
  const verdicts = reconcileSuggestions(suggestions);
  return {
    accepted: verdicts.filter((v) => v.accepted),
    rejected: verdicts.filter((v) => !v.accepted),
    verdicts,
  };
}

// --- Suggestion generation (G3 fleet/free-cloud, G6 offline fallback) --------------------------
const PROMPT_TEMPLATE = (problem) => `You draft GitHub Epic acceptance criteria. Given the problem
statement, propose 3-7 MEASURABLE acceptance criteria. Each AC MUST be verifiable from one concrete
evidence source: a file path, a child issue (#N), a numeric metric/threshold, or observable GitHub
state (label/PR/merge/CI). Reject your own aspirational phrasing ("improve", "better", "robust").

Respond ONLY as a JSON array: [{"id":"AC1","text":"...","evidence_source":"file_existence|closed_child|sensor_output|native_github_api","anchor":"..."}]

Problem statement:
${problem}`;

function parseSuggestionJson(raw) {
  const arrayMatch = String(raw || '').match(/\[[\s\S]*\]/);
  if (!arrayMatch) return null;
  try {
    const arr = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.slice(0, 7).map((s, i) => ({
      id: s.id || 'AC' + (i + 1), text: String(s.text || '').trim(),
      evidence_source: s.evidence_source || null, anchor: s.anchor || null,
    })).filter((s) => s.text);
  } catch { return null; }
}

// Deterministic offline fallback: split the problem into measurable-looking sentence clauses.
// Intentionally conservative — produces few ACs the backstop can later validate, never invents
// metrics. Keeps the tool useful (G6) when no LLM lane answers.
function fallbackSuggest(problem) {
  const seeds = String(problem || '').split(/(?<=[.;\n])\s+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const seed of seeds) {
    if (out.length >= 5) break;
    if (classifyMeasurability(seed).measurable) out.push({ id: 'AC' + (out.length + 1), text: seed, evidence_source: null, anchor: null });
  }
  if (!out.length) out.push({ id: 'AC1', text: 'Deliverable file exists and `npm test` passes for ' + (seeds[0] || 'the change'), evidence_source: 'file_existence', anchor: 'npm test' });
  return out;
}

// dispatch: injectable for tests. Returns {ok, content} or {ok:false}. Default = cascade-dispatch
// (fleet) then free-cloud failover — both zero-cost lanes, never a paid provider for suggestion.
async function defaultDispatch(prompt) {
  try {
    const { dispatchFreeCloud } = require('./free-cloud-dispatch');
    const dispatched = await dispatchFreeCloud(prompt, { timeoutMs: DISPATCH_TIMEOUT_MS });
    if (dispatched && dispatched.ok) {
      return { ok: true, content: dispatched.content, provider: dispatched.provider };
    }
  } catch { /* fleet/free-cloud unreachable → fallback */ }
  return { ok: false };
}

async function suggestACs(problemStatement, opts = {}) {
  if (!problemStatement || !String(problemStatement).trim()) {
    return { suggestions: [], source: 'none', reason: 'empty problem statement' };
  }
  const dispatch = opts.dispatch || defaultDispatch;
  const res = await dispatch(PROMPT_TEMPLATE(problemStatement));
  const parsed = res && res.ok ? parseSuggestionJson(res.content) : null;
  if (parsed && parsed.length) return { suggestions: parsed, source: res.provider || 'llm' };
  return { suggestions: fallbackSuggest(problemStatement), source: 'offline-fallback' };
}

// --- Measurement logging (feeds the replay-eval corpus; append-only, redaction-safe) ----------
function logMeasurement(record) {
  try {
    fs.mkdirSync(path.dirname(MEASURE_LOG), { recursive: true });
    fs.appendFileSync(MEASURE_LOG, JSON.stringify({ ts: record.ts || null, ...record }) + '\n');
  } catch { /* best-effort: measurement logging must never break suggestion (G6) */ }
}

module.exports = {
  classifyMeasurability, reconcileSuggestions, validateSuggestions,
  suggestACs, parseSuggestionJson, fallbackSuggest, logMeasurement,
  EVIDENCE_SOURCES, MEASURE_LOG, PROMPT_TEMPLATE,
};

if (require.main === module) { require('./ac-suggest-cli').main(process.argv.slice(2)); }
