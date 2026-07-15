---
title: "#3800-AC3 Collaborator — Epic-close-time remediation hint (execution + evidence)"
type: work-log
role: COLLABORATOR
ticket: 3800
ac: 3
created: "2026-07-15"
status: VALIDATED
---
# #3800-AC3 — Collaborator execution

## Change (reuse-first extension of the already-wired validator)
`scripts/epic-child-baton-traceability.js`:
- New pure `epicCloseHint(tickets, epicNumber)` → `{ epic, blockers:[{child, codes:[...]}], hint }`.
  Reuses `auditEpics()`, filters to the requested epic, groups warnings by child, and emits an
  actionable close-time hint naming the blocking children. Returns `hint:null` + `blockers:[]` when
  the epic is clean OR is not an actually-closing Epic (unknown id / non-epic / open epic) — no noise.
- New CLI mode `--epic <N>` prints the close-time hint for the Manager/Admin baton path
  (advisory-first, exit 0). Default (no-flag) CLI behavior UNCHANGED.
- Exported `epicCloseHint` for programmatic callers.

`scripts/epic-child-baton-traceability.spec.js`: +6 AC3 cases (names the right children; clean→null;
open/non-epic/unknown→null; EB3 open-child surfaced; scoped to requested epic only). Added an `epic0`
alias to avoid a TDZ shadow where a test destructures a local `epic` from the result.

`docs/howto/epic-child-baton-traceability.md`: new "Close-time remediation hint (AC3)" section.

## Validation evidence
- Unit: `node scripts/epic-child-baton-traceability.spec.js` → **14/14 passed** (8 pre-existing + 6 AC3).
- CLI on tracked corpus: `--epic 3799` → "clear to close"; `--epic 3800` (open) → "clear to close";
  default advisory → "0 bundling-drift warning(s)". **0 findings** (low-FP confirmed).
- Enforcement: `enforcement-wiring-audit` → **25/25 enforced, 0 UNWIRED** (validator stays enforced;
  extension, not a new file). `enforcement-telemetry --check` → exit 0, no regression.
- Baseline: NOT updated — this is an EXTENSION (no new validator ⇒ count unchanged at 25). The
  committed baseline file (`enforcedCount: 24`) is pre-existing #2275 debt (an increase to 25 is not a
  regression, so `--check` passes); out of #3800 scope — left untouched.
- Hermetic: `git archive feat/3800-ac3-close-hint | tar -x -C /tmp/ci` clean `.git`-less tree →
  `epic-child-baton-traceability.spec` 14/14 + `governance-verify.spec` 7/7 green (post-commit run).
- `governance-verify.spec.js` → 7/7 green (verdict-preserving).

Autonomy-Decision: reversible (feature push + PR + squash-merge to unprotected main).
