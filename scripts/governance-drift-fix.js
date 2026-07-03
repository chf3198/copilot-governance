'use strict';

// governance-drift-fix (#2989, Epic #2981 Phase-1) — deterministic
// auto-remediation engine for the AUTO-FIX-SAFE drift classes only:
//   D4  resolution:* label on an OPEN issue        -> strip the terminal label
//   D5  status:backlog child of an active Epic      -> swap backlog -> queued
//   D8  phase-gate:phase-1 applied to an Epic       -> strip the phase-gate label
//   D3  commit/bracket title prefix (deterministic) -> strip the prefix
// D1/D2/D6/D7 are NEVER auto-fixed here — they route to the propose-only
// queue (#2990) because they need a role verdict / language judgment.
//
// Zero LLM tokens (G3): pure `gh` JSON + deterministic rule eval. Reversible
// (G6): every applied mutation is appended to an append-only JSONL log and can
// be inverted by --rollback. Dry-run is the default; nothing is written to
// GitHub or the log unless `apply` is explicitly requested.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MUTATION_LOG = path.join(ROOT, 'logs', 'governance-drift-mutations.jsonl');

// classifyIssue already gates D3 to the deterministic prefix/bracket form, so
// every class in this set is safe to apply without language judgment.
const SAFE_CLASSES = new Set(['D3', 'D4', 'D5', 'D8']);
const TITLE_PREFIX_RE = /^(?:[a-z]+(?:\([^)]+\))?:\s+|\[[^\]]+\]\s+)/i;

function labelNames(issue) {
  return (issue.labels || []).map((label) => (typeof label === 'string' ? label : label.name));
}

function stripTitlePrefix(title) {
  const original = String(title || '');
  if (!TITLE_PREFIX_RE.test(original)) return original; // no prefix to strip — leave untouched
  const stripped = original.replace(TITLE_PREFIX_RE, '').trim();
  if (!stripped) return original; // never produce an empty title
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// Pure: given an issue and its already-computed drift classes, return the
// ordered list of safe mutations. Unsafe classes contribute nothing.
function planFix(issue, classes = []) {
  const labels = labelNames(issue);
  const mutations = [];
  for (const driftClass of classes) {
    if (!SAFE_CLASSES.has(driftClass)) continue;
    if (driftClass === 'D4') {
      for (const label of labels.filter((name) => name === 'resolution' || name.startsWith('resolution:'))) {
        mutations.push({ ticket: issue.number, class: 'D4', action: 'remove-label', label, before: label, after: null, reversible: true });
      }
    } else if (driftClass === 'D5') {
      mutations.push({ ticket: issue.number, class: 'D5', action: 'swap-label', label_remove: 'status:backlog', label_add: 'status:queued', before: 'status:backlog', after: 'status:queued', reversible: true });
    } else if (driftClass === 'D8') {
      mutations.push({ ticket: issue.number, class: 'D8', action: 'remove-label', label: 'phase-gate:phase-1', before: 'phase-gate:phase-1', after: null, reversible: true });
    } else if (driftClass === 'D3') {
      const before = String(issue.title || '');
      const after = stripTitlePrefix(before);
      if (after !== before) {
        mutations.push({ ticket: issue.number, class: 'D3', action: 'set-title', title_before: before, title_after: after, before, after, reversible: true });
      }
    }
  }
  return mutations;
}

// Inverse patch for rollback. Every safe action is exactly reversible.
function invertMutation(mutation) {
  if (mutation.action === 'remove-label') {
    return { ticket: mutation.ticket, class: mutation.class, action: 'add-label', label: mutation.label, before: null, after: mutation.label, reversible: true };
  }
  if (mutation.action === 'add-label') {
    return { ticket: mutation.ticket, class: mutation.class, action: 'remove-label', label: mutation.label, before: mutation.label, after: null, reversible: true };
  }
  if (mutation.action === 'swap-label') {
    return { ticket: mutation.ticket, class: mutation.class, action: 'swap-label', label_remove: mutation.label_add, label_add: mutation.label_remove, before: mutation.label_add, after: mutation.label_remove, reversible: true };
  }
  if (mutation.action === 'set-title') {
    return { ticket: mutation.ticket, class: mutation.class, action: 'set-title', title_before: mutation.title_after, title_after: mutation.title_before, before: mutation.title_after, after: mutation.title_before, reversible: true };
  }
  throw new Error(`governance-drift-fix: cannot invert action '${mutation.action}'`);
}

function gh(args) {
  execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
}

// The ONLY side effect on GitHub. Issue-state mutations only — never a
// tracked-file write — so the command is canonical-main + no-code-remediation safe.
function defaultMutate(mutation) {
  const ticket = String(mutation.ticket);
  if (mutation.action === 'remove-label') gh(['issue', 'edit', ticket, '--remove-label', mutation.label]);
  else if (mutation.action === 'add-label') gh(['issue', 'edit', ticket, '--add-label', mutation.label]);
  else if (mutation.action === 'swap-label') gh(['issue', 'edit', ticket, '--remove-label', mutation.label_remove, '--add-label', mutation.label_add]);
  else if (mutation.action === 'set-title') gh(['issue', 'edit', ticket, '--title', mutation.title_after]);
  else throw new Error(`governance-drift-fix: unknown action '${mutation.action}'`);
}

function appendLog(entry) {
  fs.mkdirSync(path.dirname(MUTATION_LOG), { recursive: true });
  fs.appendFileSync(MUTATION_LOG, `${JSON.stringify(entry)}\n`);
}

function readLog() {
  if (!fs.existsSync(MUTATION_LOG)) return [];
  return fs.readFileSync(MUTATION_LOG, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function defaultRunId(clock = Date) {
  return `drift-fix-${new clock().toISOString().replace(/[:.]/g, '-')}`;
}

// Pure: build the full ordered mutation plan from the open-issue corpus.
function buildPlan(issues, classify, classes) {
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  const plan = [];
  for (const issue of issues) {
    const detected = classify(issue, byNumber).filter((driftClass) => !classes || classes.includes(driftClass));
    plan.push(...planFix(issue, detected));
  }
  return plan;
}

// Execute (or dry-run) a plan; logs each applied mutation immediately so a
// rollback stays exact even after a mid-batch failure.
function executePlan(plan, { apply, runId, actor, mutate, log, clock }) {
  const applied = [];
  const errors = [];
  for (const mutation of plan) {
    const entry = { run_id: runId, started_at: new clock().toISOString(), actor, mode: apply ? 'fix' : 'dry-run', ...mutation };
    if (!apply) { applied.push(entry); continue; }
    try {
      mutate(mutation);
      log(entry);
      applied.push(entry);
    } catch (error) {
      errors.push({ ticket: mutation.ticket, class: mutation.class, error: error.message });
      break;
    }
  }
  return { applied, errors };
}

// Plan + (optionally) apply safe fixes across the open-issue corpus.
// `apply` MUST be explicit; the default is a no-write dry run.
function applyFixes(issues = [], options = {}) {
  const {
    apply = false, classes = null, classify, runId = defaultRunId(),
    actor = process.env.USER || 'drift-sweep', mutate = defaultMutate, log = appendLog, clock = Date,
  } = options;
  if (typeof classify !== 'function') throw new Error('applyFixes: classify function is required');
  const plan = buildPlan(issues, classify, classes);
  const { applied, errors } = executePlan(plan, { apply, runId, actor, mutate, log, clock });
  return { runId, applied: apply, planned: plan.length, mutations: applied, errors, safeClasses: [...SAFE_CLASSES] };
}

// Replay the inverse of every applied mutation for `runId`, newest-first.
function rollback(runId, options = {}) {
  const {
    mutate = defaultMutate,
    log = appendLog,
    read = readLog,
    actor = process.env.USER || 'drift-sweep',
    clock = Date,
  } = options;
  const entries = read().filter((entry) => entry.run_id === runId && entry.mode === 'fix');
  const reversed = [];
  const errors = [];
  for (const entry of entries.reverse()) {
    const inverse = invertMutation(entry);
    try {
      mutate(inverse);
      const rbEntry = { run_id: `rollback-${runId}`, started_at: new clock().toISOString(), actor, mode: 'rollback', rollback_of: runId, ...inverse };
      log(rbEntry);
      reversed.push(rbEntry);
    } catch (error) {
      errors.push({ ticket: entry.ticket, class: entry.class, error: error.message });
      break;
    }
  }
  return { runId, rolledBack: reversed.length, mutations: reversed, errors };
}

module.exports = {
  planFix,
  invertMutation,
  applyFixes,
  rollback,
  stripTitlePrefix,
  defaultRunId,
  readLog,
  SAFE_CLASSES,
  MUTATION_LOG,
};
