"use strict";
// guardrail-conversion-signal (Epic #3380 / #3386): emit a schema-v3 observability signal capturing
// the friction-to-guardrail conversion opportunity, classifier precision, and resident-memory
// footprint, so the guardrail-first shift is measurable per-team and per-mechanism (G8/G9).
const path = require("path");
const { auditMemoryDir } = require("./memory-guardrail-audit");
const { emitV3 } = require("./event-schema-v3");

let evaluate = null;
let loadCorpus = null;
try {
  ({ evaluate, loadCorpus } = require("./friction-classifier-replay-eval"));
} catch (_err) { /* replay-eval optional; precision degrades to null */ }

const EVENTS_PATH = path.join(__dirname, "..", "..", "dashboard", "events.jsonl");

/** Count guardrail-candidate entries per proposed mechanism. */
function mechanismBreakdown(entries) {
  return (entries || [])
    .filter((entry) => entry.destination === "guardrail-candidate")
    .reduce((acc, entry) => {
      const key = entry.mechanism || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
}

/** Read classifier precision + promotion state from the replay-eval corpus (null if unavailable). */
function precisionState() {
  if (!evaluate || !loadCorpus) return { precision: null, promotion_state: "advisory" };
  try {
    const result = evaluate(loadCorpus());
    return {
      precision: result.precision,
      promotion_state: result.promotionEligible ? "blocking-eligible" : "advisory",
    };
  } catch (_err) {
    return { precision: null, promotion_state: "advisory" };
  }
}

/** Build the schema-v3 conversion signal from a memory-dir audit + replay-eval. */
function buildConversionSignal(opts) {
  const options = opts || {};
  const audit = auditMemoryDir(options.memoryDir);
  const counts = audit.counts || {};
  const candidates = counts["guardrail-candidate"] || 0;
  const total = (audit.entries || []).length;
  const eval_ = precisionState();
  return {
    ts: options.ts || new Date().toISOString(),
    version: 3, service: "guardrail-conversion", env: "local",
    event: "guardrail-conversion-rate",
    note_index_total: total,
    guardrail_candidate_count: candidates,
    semantic_memory_count: counts["semantic-memory"] || 0,
    conversion_opportunity_ratio: total ? Number((candidates / total).toFixed(4)) : 0,
    classifier_precision: eval_.precision,
    promotion_state: eval_.promotion_state,
    mechanism_breakdown: mechanismBreakdown(audit.entries),
    _summary: `${candidates}/${total} memory notes are guardrail-candidates; `
      + `classifier precision ${eval_.precision}`,
  };
}

/** Emit the signal to dashboard/events.jsonl (validated by emitV3). */
function emitConversionSignal(opts) {
  const signal = buildConversionSignal(opts);
  emitV3(signal, (opts && opts.file) || EVENTS_PATH);
  return signal;
}

module.exports = { buildConversionSignal, emitConversionSignal, mechanismBreakdown, EVENTS_PATH };

if (require.main === module) {
  const signal = buildConversionSignal();
  if (process.argv.includes("--emit")) emitConversionSignal();
  console.log(JSON.stringify(signal, null, 2));
}
