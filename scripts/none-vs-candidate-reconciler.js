'use strict';
// none-vs-candidate-reconciler — the anti-checkbox-fatigue rule (Epic #3425 P1-f).
//
// The load-bearing rule the P1-a validator deferred to here: a `flaws_recognized: none` is valid ONLY
// when the per-review-point checkpoint surfaced zero candidates (or only un-escalated low-severity
// ones). A `none` contradicted by a medium/high candidate is a VIOLATION — the discretion #2709
// forbids is removed because the evidence the role must answer to is machine-produced. This module
// implements the AC-R3 `none`-validator x recurrence-escalation state machine:
//
//   none + 0 candidates                 -> pass
//   none + only low-sev (un-escalated)  -> advisory (candidates listed)
//   none + >=3 same pattern_id low-sev  -> escalates to medium -> VIOLATION
//   none + any medium/high candidate    -> VIOLATION
//   EXCEPTION (AC4): a MEDIUM-CONFIDENCE F6 candidate never forces a violation (advisory forever)
//
// Ships ADVISORY (AC5): the megalint wrapper tags every finding severity:'advisory' until the P1-g
// replay-eval promotion gate flips it. Reuse-first: escalation reads the same incidents.jsonl
// recurrence count as #3165/#3431; block parsing reuses flaws-recognized.js.

const fs = require('fs');
const path = require('path');
const { ESCALATION_RECURRENCE } = require('./friction-sensors');
const { extractBlock } = require(path.join(__dirname, 'megalint', 'flaws-recognized.js'));

const BLOCKING_SEVERITIES = new Set(['medium', 'high', 'critical']);
// `none` is bare only when it is the whole value — NOT a prefix of a longer token like
// `none-of-your-business` (which must be treated as a non-none, disposed/other value).
const BARE_NONE_RE = /flaws_recognized\s*:\s*none\b(?![-\w])/i;

// Count every pattern_id in incidents.jsonl ONCE (perf: avoid a file read per candidate). Returns a Map.
function recurrenceCounts(incidentsPath) {
  const counts = new Map();
  if (!incidentsPath) return counts;
  try {
    for (const line of fs.readFileSync(incidentsPath, 'utf8').split('\n')) {
      if (!line) continue;
      let pid;
      try { pid = JSON.parse(line).pattern_id; } catch { continue; }
      if (pid) counts.set(pid, (counts.get(pid) || 0) + 1);
    }
  } catch { /* missing/unreadable file => empty map (fail-open) */ }
  return counts;
}

// A candidate's EFFECTIVE severity after applying the 3-strike low-sev recurrence escalation.
function effectiveSeverity(candidate, counts) {
  if (!candidate || candidate.severity !== 'low' || !candidate.pattern_id) {
    return (candidate && candidate.severity) || 'low';
  }
  const prior = (counts && counts.get(candidate.pattern_id)) || 0;
  return prior + 1 >= ESCALATION_RECURRENCE ? 'medium' : 'low';
}

// True when a candidate makes a bare `none` a VIOLATION. AC4 carve-out: a medium-confidence F6
// contradiction is advisory-only and never blocks, even at medium/high severity. Non-objects can't block.
function candidateBlocksNone(candidate, counts) {
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.class === 'F6' && candidate.confidence === 'medium') return false;
  return BLOCKING_SEVERITIES.has(effectiveSeverity(candidate, counts instanceof Map ? counts : recurrenceCounts(counts)));
}

// True when the artifact's flaws_recognized value is a bare `none` (vs a disposed per-candidate block).
function isBareNone(flawsValue, body) {
  if (typeof flawsValue === 'string' && /^none\b(?![-\w])/i.test(flawsValue.trim())) return true;
  const block = extractBlock(body) || '';
  return BARE_NONE_RE.test(block) && !/^\s*decision\s*:/im.test(block);
}

// Reconcile a single artifact's flaws_recognized disposition against the candidate feed for its window.
// @returns {{status:'pass'|'advisory'|'violation', blocking:[], advisory:[]}}
function reconcile(input = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const incidentsPath = input.incidentsPath;
  const bareNone = input.flawsRecognized !== undefined
    ? isBareNone(input.flawsRecognized, input.body)
    : isBareNone(null, input.body);
  if (!bareNone) return { status: 'pass', blocking: [], advisory: [] }; // a disposed block is P1-a's domain
  if (candidates.length === 0) return { status: 'pass', blocking: [], advisory: [] };
  const counts = recurrenceCounts(incidentsPath); // read the recurrence file ONCE (perf)
  const blocking = candidates.filter((candidate) => candidateBlocksNone(candidate, counts));
  const advisory = candidates.filter((candidate) => !candidateBlocksNone(candidate, counts));
  if (blocking.length > 0) return { status: 'violation', blocking, advisory };
  return { status: 'advisory', blocking: [], advisory };
}

// megalint-shaped wrapper: returns advisory findings (AC5 — never blocks in the advisory ship).
function validateArtifact(name, body, candidates, opts = {}) {
  const result = reconcile({ body, candidates, incidentsPath: opts.incidentsPath });
  const findings = [];
  if (result.status === 'violation') {
    findings.push({ rule: 'none-vs-candidate-violation', severity: 'advisory',
      detail: `${name} declares flaws_recognized: none but the checkpoint surfaced ${result.blocking.length} `
        + `medium/high candidate(s) that must be disposed: `
        + `${result.blocking.map((candidate) => candidate.pattern_id).join(', ')} `
        + `(will BLOCK once the P1-g promotion gate flips).` });
  } else if (result.status === 'advisory' && result.advisory.length > 0) {
    findings.push({ rule: 'none-vs-candidate-low-sev', severity: 'advisory',
      detail: `${name} flaws_recognized: none accepted with ${result.advisory.length} low-severity / `
        + `medium-confidence-F6 candidate(s) noted: ${result.advisory.map((candidate) => candidate.pattern_id).join(', ')}.` });
  }
  return findings;
}

module.exports = {
  reconcile, validateArtifact, candidateBlocksNone, effectiveSeverity, isBareNone, BLOCKING_SEVERITIES,
};
