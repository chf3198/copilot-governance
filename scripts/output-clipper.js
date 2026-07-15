#!/usr/bin/env node
'use strict';
// output-clipper.js (#3141, Epic #3137 T3): deterministically bound verbose tool outputs (grep/gh
// dumps) before they enter the context window — keep head + tail + matched lines, elide the bulk.
// Lossless under budget (no-op); idempotent; graceful on non-string. Reduces tokens on BOTH lanes.
// Deterministic, local, $0 — no LLM, no network.

const DEFAULT_HEAD = 20;
const DEFAULT_TAIL = 10;
const DEFAULT_MAX_LINES = 60;

/** Indices to keep: head + tail (+ lines matching matchRe).
 * @param {string[]} lines all lines. @param {number} head @param {number} tail @param {RegExp|null} matchRe @returns {Set<number>} */
function keptIndices(lines, head, tail, matchRe) {
  const kept = new Set();
  for (let i = 0; i < head && i < lines.length; i += 1) kept.add(i);
  for (let i = Math.max(0, lines.length - tail); i < lines.length; i += 1) kept.add(i);
  if (matchRe)
    lines.forEach((line, idx) => {
      if (matchRe.test(line)) kept.add(idx);
    });
  return kept;
}

/** Clip text to head + tail (+ matched lines), eliding the middle when over the line budget.
 * @param {string} text input. @param {object} [opts] {maxLines, head, tail, match}. @returns {string} */
function clip(text, opts = {}) {
  if (typeof text !== 'string') return text;
  const lines = text.split('\n');
  const maxLines = opts.maxLines || DEFAULT_MAX_LINES;
  if (lines.length <= maxLines) return text; // lossless under budget
  const matchRe = opts.match ? new RegExp(opts.match, 'i') : null;
  const kept = keptIndices(lines, opts.head || DEFAULT_HEAD, opts.tail || DEFAULT_TAIL, matchRe);
  const out = [];
  let elided = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (kept.has(i)) {
      if (elided) {
        out.push(`[... ${elided} line(s) elided ...]`);
        elided = 0;
      }
      out.push(lines[i]);
    } else {
      elided += 1;
    }
  }
  if (elided) out.push(`[... ${elided} line(s) elided ...]`);
  return out.join('\n');
}

function main() {
  const text = require('fs').readFileSync(0, 'utf8');
  process.stdout.write(clip(text));
}

if (require.main === module) main();
module.exports = { clip };
