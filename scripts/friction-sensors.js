'use strict';
// friction-sensors — the two net-new friction detectors the taxonomy needs (Epic #3425 P1-d).
// F2 (>=N near-identical retries of the same op) and F5 (self-correction / revert) read a list
// of recent tool invocations and emit low-severity friction candidates via the existing
// emitFriction (#3165) schema — no new schema, no new log. Recurrence escalation (3+ of the same
// pattern_id) promotes low -> medium by reading the existing incidents.jsonl recurrence count.
//
// Pure-function core (scanInvocations / detectRetries / detectSelfCorrection) so the detectors are
// unit-testable without disk; emit + escalate are the thin IO wrappers.

const fs = require('fs');
const { emitFriction } = require('./friction-event');

const DEFAULT_RETRY_THRESHOLD = 3;
const RETRY_PATTERN_ID = 'friction-retry-loop';
const SELF_CORRECTION_PATTERN_ID = 'friction-self-correction';
const ESCALATION_RECURRENCE = 3; // 3+ same pattern_id low-sev -> medium (per #3426 AC-R3 state machine)

const BASH_TOOLS = new Set(['Bash', 'run_command', 'run_in_terminal', 'terminal']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'replace_file_content']);
// F5 signals: a git history rewrite/undo, or an explicit discard.
const SELF_CORRECTION_RE = /\bgit\s+(?:revert|reset)\b|--amend\b|\bgit\s+checkout\s+--\b|\bgit\s+stash\b|discard_changes\s*[:=]\s*true/i;

// Normalize an invocation to a comparable signature: tool + collapsed-whitespace command/target.
function signature(invocation) {
  const tool = String(invocation.tool || '');
  const text = String(invocation.command || invocation.input || invocation.target || '').replace(/\s+/g, ' ').trim();
  return `${tool}::${text}`;
}

// F2: count near-identical Bash/Edit invocations in the window; a candidate fires at the threshold.
function detectRetries(invocations, opts = {}) {
  const threshold = opts.threshold || DEFAULT_RETRY_THRESHOLD;
  const counts = new Map();
  for (const invocation of invocations || []) {
    const tool = String(invocation.tool || '');
    if (!BASH_TOOLS.has(tool) && !EDIT_TOOLS.has(tool)) continue;
    const key = signature(invocation);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const candidates = [];
  for (const [key, count] of counts) {
    if (count >= threshold) {
      candidates.push({ class: 'F2', pattern_id: RETRY_PATTERN_ID, severity: 'low',
        detail: `${count} near-identical invocations of ${key.slice(0, 80)} in the review-point window`, count });
    }
  }
  return candidates;
}

// F5: an invocation that reverts/undoes prior work (history rewrite, discard, or an Edit undoing an Edit).
function detectSelfCorrection(invocations) {
  const candidates = [];
  const editedTargets = new Set();
  for (const invocation of invocations || []) {
    const text = String(invocation.command || invocation.input || '');
    if (SELF_CORRECTION_RE.test(text)) {
      candidates.push({ class: 'F5', pattern_id: SELF_CORRECTION_PATTERN_ID, severity: 'low',
        detail: `self-correction signal: ${text.replace(/\s+/g, ' ').trim().slice(0, 80)}` });
      continue;
    }
    const target = invocation.target || invocation.file;
    if (EDIT_TOOLS.has(String(invocation.tool || '')) && target) {
      if (invocation.undoesPrior || editedTargets.has(target)) {
        // a re-edit of an already-edited target within the window is a weak self-correction signal
        if (invocation.undoesPrior) {
          candidates.push({ class: 'F5', pattern_id: SELF_CORRECTION_PATTERN_ID, severity: 'low',
            detail: `edit undoing a prior edit of ${target}` });
        }
      }
      editedTargets.add(target);
    }
  }
  return candidates;
}

// Run both detectors over a window of invocations; returns the de-duplicated candidate list.
function scanInvocations(invocations, opts = {}) {
  return [...detectRetries(invocations, opts), ...detectSelfCorrection(invocations)];
}

// Count prior incidents.jsonl rows carrying this pattern_id (the same recurrence model #3165 uses).
function recurrenceCount(patternId, incidentsPath) {
  try {
    const lines = fs.readFileSync(incidentsPath, 'utf8').split('\n').filter(Boolean);
    let total = 0;
    for (const line of lines) {
      try { if (JSON.parse(line).pattern_id === patternId) total += 1; } catch { /* skip malformed */ }
    }
    return total;
  } catch { return 0; }
}

// A low-sev candidate becomes medium once it recurs ESCALATION_RECURRENCE+ times (anti-accumulation).
function escalateByRecurrence(candidate, incidentsPath) {
  if (candidate.severity !== 'low') return candidate;
  const prior = recurrenceCount(candidate.pattern_id, incidentsPath);
  if (prior + 1 >= ESCALATION_RECURRENCE) return { ...candidate, severity: 'medium', escalated: true };
  return candidate;
}

// Emit a candidate as a friction event (best-effort; never throws into the caller's hot path).
function emitCandidate(candidate, fields = {}, opts = {}) {
  try {
    return emitFriction(candidate.pattern_id, {
      severity: candidate.severity, surface: fields.surface || 'tool-activity',
      role: fields.role, detail: candidate.detail, team: fields.team, runtime: fields.runtime,
    }, opts);
  } catch { return null; }
}

module.exports = {
  detectRetries, detectSelfCorrection, scanInvocations, recurrenceCount, escalateByRecurrence,
  emitCandidate, DEFAULT_RETRY_THRESHOLD, ESCALATION_RECURRENCE,
  RETRY_PATTERN_ID, SELF_CORRECTION_PATTERN_ID,
};
