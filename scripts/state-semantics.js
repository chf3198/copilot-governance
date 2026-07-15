#!/usr/bin/env node
'use strict';

// state-semantics (#3808, Epic 2632 Phase-1 P1-a) — canonical two-axis state model.
//
// The governance corpus carries ticket state on two INDEPENDENT axes that were never formally
// reconciled (see wiki/wisdom/project/research/state-semantics-synthesis-2632.md §1):
//
//   • Axis A — existence / mirror state: frontmatter `status:` ∈ {OPEN, CLOSED} (the existence bit).
//   • Axis B — workflow lifecycle: the `status:*` GitHub label (the richer lifecycle enum the baton drives).
//
// The core defect (§1) is that nothing ties `terminal(label) ⟺ CLOSED(existence)`, and there is no
// canonical enum constraining either axis. This module is the SINGLE source-of-truth for that model:
// pure constants + side-effect-free helpers, no behavior change. It is the substrate the Phase-1 P1-b
// invariant checks (I1–I5) consume; it enforces nothing by itself (advisory-first).
//
// Hermetic: Node built-ins only. Importing this file performs no I/O.

// ── Axis B — lifecycle enum, partitioned (synthesis §3.1) ───────────────────────────────────────────

// Active lifecycle states — the issue MUST be OPEN while it carries one of these.
const ACTIVE = Object.freeze([
  'backlog', 'todo', 'queued', 'triage', 'ready',
  'in-progress', 'testing', 'review', 'measuring',
]);

// Epic-only active holds — legal only on an Epic, still imply OPEN.
const EPIC_ONLY_ACTIVE = Object.freeze(['deferred', 'dormant']);

// Terminal lifecycle states — the issue MUST be CLOSED while it carries one of these.
const TERMINAL = Object.freeze(['done', 'cancelled', 'archived']);

// Observed one-off aliases folded into a canonical state rather than admitting a new enum member
// (§3.1: `advisory-complete` folds into `done` with `resolution:advisory`, no new terminal state).
const ALIASES = Object.freeze({ 'advisory-complete': 'done' });

// ── Axis A — existence enum (synthesis §3.2) ────────────────────────────────────────────────────────

const AXIS_A = Object.freeze(['OPEN', 'CLOSED']);

// Classification return values (stable string constants for callers to compare against).
const ACTIVE_KIND = 'active';
const TERMINAL_KIND = 'terminal';
const UNKNOWN_KIND = 'unknown';

// Precomputed lookup sets (all lifecycle labels that imply OPEN vs CLOSED).
const ACTIVE_SET = new Set([...ACTIVE, ...EPIC_ONLY_ACTIVE]);
const TERMINAL_SET = new Set(TERMINAL);

// Normalize a raw label to its canonical form: trim, lowercase, resolve aliases. Non-strings → ''.
function normalizeLabel(label) {
  if (typeof label !== 'string') return '';
  const key = label.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ALIASES, key) ? ALIASES[key] : key;
}

// classify(label) → 'active' | 'terminal' | 'unknown'  (alias-resolved, case-insensitive).
function classify(label) {
  const key = normalizeLabel(label);
  if (ACTIVE_SET.has(key)) return ACTIVE_KIND;
  if (TERMINAL_SET.has(key)) return TERMINAL_KIND;
  return UNKNOWN_KIND;
}

// axisAOf(label) → the frontmatter existence status a lifecycle label IMPLIES (the I1 mapping, as data):
//   active   → 'OPEN'
//   terminal → 'CLOSED'
//   unknown  → null
// This is the canonical relation; it does NOT read or assert any ticket's actual frontmatter (that is
// P1-b's advisory check). Pure data.
function axisAOf(label) {
  switch (classify(label)) {
    case ACTIVE_KIND: return 'OPEN';
    case TERMINAL_KIND: return 'CLOSED';
    default: return null;
  }
}

// isCanonicalStatus(s) → is `s` a member of the Axis-A existence enum (enum-closure, I5). Case-sensitive:
// the canonical existence bit is exactly 'OPEN'/'CLOSED' (§3.2 — hand-edited drift like 'DONE'/'READY'
// is intentionally NOT canonical so the closure check flags it).
function isCanonicalStatus(s) {
  return s === 'OPEN' || s === 'CLOSED';
}

// isKnownLabel(label) → is `label` a member of the Axis-B lifecycle enum (enum-closure, I5), after
// alias resolution and case-folding.
function isKnownLabel(label) {
  return classify(label) !== UNKNOWN_KIND;
}

module.exports = {
  ACTIVE,
  EPIC_ONLY_ACTIVE,
  TERMINAL,
  ALIASES,
  AXIS_A,
  ACTIVE_KIND,
  TERMINAL_KIND,
  UNKNOWN_KIND,
  normalizeLabel,
  classify,
  axisAOf,
  isCanonicalStatus,
  isKnownLabel,
};

// Advisory self-report when run directly (never blocks; exits 0). No import-time side effects.
if (require.main === module) {
  const summary = {
    active: ACTIVE,
    epicOnlyActive: EPIC_ONLY_ACTIVE,
    terminal: TERMINAL,
    aliases: ALIASES,
    axisA: AXIS_A,
  };
  console.log(JSON.stringify({ module: 'state-semantics', model: 'two-axis', summary }, null, 2));
  process.exit(0);
}
