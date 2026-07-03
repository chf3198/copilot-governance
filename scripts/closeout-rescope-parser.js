'use strict';
// Refs #1289/#3319/#3329 — Epic acceptance-criterion parser consumed by the AC reconciler.
// Scoped to parseEpicAcs for the #3319 re-land; the full EPIC_RESCOPE block parser
// (parseRescopeBlocks) belongs to the closeout-lint wave, re-scoped out of #3319.
//
// #3329 fix: the original regex `\*\*?(AC\d+)` required at least one asterisk, so plain
// `- [ ] AC1: ...` ACs (the format used in most Epic bodies, including #1299) did not parse —
// only bold `**AC1**` did. Asterisks are now optional (0, 1, or 2 each side), and the trailing
// AC text is captured (the reconciler already reads `ac.text`).

function parseEpicAcs(body) {
  const acs = [];
  const lines = (body || '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s*\*{0,2}(AC\d+)\*{0,2}[:\s]\s*(.*)$/);
    if (match) {
      acs.push({
        id: match[2],
        checked: match[1].toLowerCase() === 'x',
        text: (match[3] || '').trim() || null,
      });
    }
  }
  return acs;
}

module.exports = { parseEpicAcs };
