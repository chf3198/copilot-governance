'use strict';
// closeout-recurrence-guard (#3025 AC2) — reject `memory-note-only` anneal
// decisions whose pattern_id has already recurred.
//
// Rationale: per the flaw-recognition contract in role-baton-routing.instructions.md,
// classifying a flaw as `memory-note-only` asserts "a memory note is sufficient; no
// structural fix is warranted." If the SAME pattern_id is already recorded in
// incidents.jsonl, that assertion is self-refuting — the pattern recurred despite the
// existing note, so the correct classification is `file-ticket` (a structural gap).
// This guard turns that judgment into a deterministic, hard-blocking closeout check.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_INCIDENTS = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');

// A flaw entry is one logical line (the per-line citation convention, #flaw-emission).
// We only treat a pattern_id as "memory-note-only" when both tokens co-occur on the
// SAME line, so an unrelated prose mention of a pattern_id is never misclassified.
const MEMORY_NOTE_MARKER = /memory-note-only/i;
const PATTERN_ID_TOKEN = /pattern_id["']?\s*[:=]\s*["']?([A-Za-z0-9._-]+)/i;

/**
 * Extract the pattern_ids that a closeout body declares as `memory-note-only`.
 * @param {string} body - CONSULTANT_CLOSEOUT comment body.
 * @returns {string[]} de-duplicated pattern_ids tied to a memory-note-only decision.
 */
function extractMemoryNotePatterns(body) {
  if (typeof body !== 'string') return [];
  const found = new Set();
  for (const line of body.split(/\r?\n/)) {
    if (!MEMORY_NOTE_MARKER.test(line)) continue;
    const match = line.match(PATTERN_ID_TOKEN);
    if (match && match[1]) found.add(match[1]);
  }
  return [...found];
}

/**
 * Collect the set of pattern_ids already recorded in incidents.jsonl.
 * Malformed lines and a missing file degrade to an empty set (no false block).
 * @param {string} incidentsPath
 * @returns {Set<string>}
 */
function knownPatternIds(incidentsPath = DEFAULT_INCIDENTS) {
  const known = new Set();
  let raw;
  try { raw = fs.readFileSync(incidentsPath, 'utf8'); }
  catch { return known; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event && typeof event.pattern_id === 'string') known.add(event.pattern_id);
    } catch { /* skip malformed incident line */ }
  }
  return known;
}

/**
 * Hard-blocking check: a memory-note-only decision on an already-recurring pattern.
 * @param {string} body
 * @param {{ incidentsPath?: string }} [opts]
 * @returns {{ rule: string, detail: string }[]}
 */
function checkMemoryNoteRecurrence(body, opts = {}) {
  const declared = extractMemoryNotePatterns(body);
  if (declared.length === 0) return [];
  const known = knownPatternIds(opts.incidentsPath || DEFAULT_INCIDENTS);
  return declared
    .filter((patternId) => known.has(patternId))
    .map((patternId) => ({
      rule: 'memory-note-only-on-recurring-pattern',
      detail: `CONSULTANT_CLOSEOUT classifies pattern_id '${patternId}' as memory-note-only, but `
        + `'${patternId}' already exists in incidents.jsonl — recurrence proves a memory note is `
        + 'insufficient. Re-classify the flaw decision to file-ticket (structural/repeatable gap).',
    }));
}

module.exports = {
  DEFAULT_INCIDENTS,
  extractMemoryNotePatterns,
  knownPatternIds,
  checkMemoryNoteRecurrence,
};
