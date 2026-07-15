"use strict";
// friction-classifier (Epic #3380 / Phase-0 #3381): deterministic router that sends a
// Tier-2 friction record to one of four destinations, so recurring deterministic friction
// becomes a GUARDRAIL rather than a context-growing memory note. Fail-open to memory.
const fs = require("fs");
const path = require("path");

const DEFAULT_LEXICON_PATH = path.join(__dirname, "..", "..", "config", "friction-lexicon.json");
const MECH_MARKER_RE = /\b(gate|hook|validator|marker|regex|schema|parser|state[-_]?file|enforcer)\s*:/i;
const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

// Cache lexicons by resolved path so a hot loop pays the file read ONCE, not per call (G3/G7).
const _lexiconCache = new Map();

function loadLexicon(lexiconPath) {
  const key = lexiconPath || DEFAULT_LEXICON_PATH;
  if (_lexiconCache.has(key)) return _lexiconCache.get(key);
  let lexicon;
  try {
    lexicon = JSON.parse(fs.readFileSync(key, "utf8"));
  } catch (_e) {
    lexicon = { mechanical: [], judgment: [] };
  }
  _lexiconCache.set(key, lexicon);
  return lexicon;
}

function termHits(text, terms) {
  const lower = text.toLowerCase();
  return (terms || []).filter((w) => lower.includes(w));
}

function recordText(record) {
  return [record._summary, record.pattern_id, record.gate, record.marker,
    record.file, record.note, record.body, record.title]
    .filter(Boolean).join(" ").toString();
}

// Precompute the deterministic signals a routing decision needs from a friction record.
function buildContext(rec, lexicon) {
  const text = recordText(rec);
  const mech = termHits(text, lexicon.mechanical);
  return {
    text, mech,
    recurrence: Number(rec.recurrence_7d != null ? rec.recurrence_7d : (rec.recurrence || 0)),
    severity: SEVERITY_RANK[String(rec.severity || "").toLowerCase()] || 0,
    judg: termHits(text, lexicon.judgment),
    hasMechanicalSurface: MECH_MARKER_RE.test(text) || mech.length > 0,
    isClient: String(rec.trigger_role || "").toLowerCase() === "client",
    steps: Array.isArray(rec.steps) ? rec.steps.length : 0,
  };
}

// Map a precomputed context to one of the four destinations (priority order matters).
function decideDestination(ctx) {
  // Anti-over-route: judgment/preference WINS on collision -> never auto-guardrail a preference.
  if (ctx.judg.length > 0 || ctx.isClient) {
    const signals = ["judgment:" + (ctx.judg.join(",") || "trigger_role=client")];
    if (ctx.hasMechanicalSurface) signals.push("ambiguous:mechanical+judgment->memory");
    return { destination: "semantic-memory", confidence: ctx.hasMechanicalSurface ? "low" : "high",
      signals, ambiguous: ctx.hasMechanicalSurface };
  }
  // guardrail-candidate: mechanical surface AND recurrence>=2 AND severity>=medium AND reproducible.
  if (ctx.hasMechanicalSurface && ctx.recurrence >= 2 && ctx.severity >= SEVERITY_RANK.medium) {
    return { destination: "guardrail-candidate", confidence: "high",
      signals: ["mechanical:" + ctx.mech.join(","), "recurrence=" + ctx.recurrence, "severity>=medium"] };
  }
  // skill: a correct, reusable multi-step procedure (>=3 ordered steps), not a defect.
  if (ctx.steps >= 3 && !ctx.hasMechanicalSurface) {
    return { destination: "skill", confidence: "medium", signals: ["multi-step-procedure:" + ctx.steps] };
  }
  // forget: one-off operational event below the recurrence floor.
  if (ctx.recurrence < 2) {
    return { destination: "forget", confidence: "medium", signals: ["recurrence<2", "one-off"] };
  }
  // Mechanical but below severity/recurrence threshold -> not yet guardrail-worthy; keep (fail-open).
  return { destination: "semantic-memory", confidence: "low", signals: ["mechanical-below-threshold-failopen"] };
}

// classifyFriction(record, opts?) -> { destination, confidence, signals[], ambiguous? }
// destination in {guardrail-candidate, skill, semantic-memory, forget}. Fail-open to memory.
function classifyFriction(record, opts) {
  opts = opts || {};
  try {
    const lexicon = opts.lexicon || loadLexicon(opts.lexiconPath);
    const rec = record || {};
    if (!recordText(rec).trim()) {
      return { destination: "semantic-memory", confidence: "low", signals: ["empty-record-failopen"] };
    }
    return decideDestination(buildContext(rec, lexicon));
  } catch (e) {
    return { destination: "semantic-memory", confidence: "low",
      signals: ["exception-failopen:" + ((e && e.message) || "err")] };
  }
}

module.exports = { classifyFriction, loadLexicon };

if (require.main === module) {
  const arg = process.argv.slice(2).join(" ");
  let rec = {};
  try { rec = arg ? JSON.parse(arg) : {}; } catch (_e) { rec = { _summary: arg }; }
  console.log(JSON.stringify(classifyFriction(rec), null, 2));
}
