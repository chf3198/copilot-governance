'use strict';
// Replay-eval harness (Epic #2037 P1.5, Refs #2675). The PROMOTION GATE for making
// the programmatic builders the DEFAULT baton path: re-render each historical artifact
// from its reconstructed structured input and measure the byte-identical reproduction
// rate. The default flips only when rate >= PROMOTION_THRESHOLD over the full corpus —
// replay-eval-gated, NO calendar threshold (per #1771/#1875, mirrors #2111).
const { buildArtifact } = require('./baton-artifact-builder');
const { buildPrBody } = require('./baton-pr-builders');

const PROMOTION_THRESHOLD = 0.85;

// kind -> renderer. A corpus entry declares which builder reconstructs it.
const RENDERERS = {
  comment: (input) => buildArtifact(input),
  'pr-body': (input) => buildPrBody(input),
};

function renderCase(entry) {
  const renderer = RENDERERS[entry.kind || 'comment'];
  if (!renderer) throw new Error(`unknown replay kind: ${entry.kind}`);
  return renderer(entry.input);
}

// Evaluate a corpus of { name, kind, input, expected } entries. Returns the
// byte-identical reproduction rate plus the mismatch list (for diagnosis). A render
// error counts as a mismatch (never throws past one bad entry) so one malformed
// historical artifact cannot abort the whole eval.
function replayEval(corpus) {
  if (!Array.isArray(corpus) || corpus.length === 0) throw new Error('replay corpus is empty');
  const mismatches = [];
  let matched = 0;
  for (const entry of corpus) {
    let actual;
    try { actual = renderCase(entry); } catch (err) { actual = `<<render-error: ${err.message}>>`; }
    if (actual === entry.expected) matched += 1;
    else mismatches.push({ name: entry.name, kind: entry.kind || 'comment' });
  }
  return { total: corpus.length, matched, rate: matched / corpus.length, mismatches };
}

function meetsGate(rate, threshold = PROMOTION_THRESHOLD) {
  return typeof rate === 'number' && rate >= threshold;
}

module.exports = {
  replayEval, meetsGate, renderCase, PROMOTION_THRESHOLD, RENDERERS,
};
