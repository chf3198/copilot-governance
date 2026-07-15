---
title: "#3800-AC3 Consultant — independent critique"
type: work-log
role: CONSULTANT
ticket: 3800
ac: 3
created: "2026-07-15"
status: ACCEPT
---
# #3800-AC3 — Consultant critique

## Verdict: ACCEPT — risk LOW

### Does AC3 meet its criterion?
Yes. AC3 requires "an actionable remediation hint at Epic-close time (Manager/Admin baton path)
naming the un-evidenced children." `epicCloseHint()` + the `--epic <N>` CLI produce exactly that: a
child-naming, actionable message ("give each its own CONSULTANT_CLOSEOUT + GitHub Evidence Block …
do not bundle-close"), scoped to the specific Epic being closed.

### Reuse-first / scope discipline
The change reuses the validated `auditEpics()` predicate rather than reimplementing detection — the
hint's false-positive profile is identical to the Phase-0 detector already shipped and consensus-
ratified. No new validator was introduced, so the enforcement count is unchanged (25/25) and the
baseline was correctly left untouched (a NEW validator would move it; an extension does not).

### Low-false-positive (the standing hazard for this family)
Verified by construction and by test: `epicCloseHint` returns `null` for a clean epic, an open epic,
a non-epic id, and an unknown id; and scopes strictly to the requested epic (does not leak another
epic's drift). On the tracked corpus it produces 0 findings. This satisfies the roadmap's low-FP rule
— it keys off the structured `auditEpics` predicate, not keyword-matched prose.

### Advisory boundary respected
AC3 is a HINT, not a gate — the CLI always exits 0. Promotion to a blocking Epic-close gate remains
AC4 (needs the shadow-FP metric + a fresh cross-family consensus per the Epic's hard gate). This
change does not pre-empt that boundary.

### Evidence integrity (C-G1): NONE at risk
No fabricated tests, no manufactured scope — AC3 is a written, committed acceptance criterion on the
OPEN Epic #3800. The pre-existing `1893.md` MC3 advisory and the ~640 untracked-corpus figure are
correctly left as-is.

### Verification reviewed
14/14 unit green; hermetic clean-tree archive 14/14 + governance-verify 7/7; enforcement-wiring-audit
25/25 enforced 0 unwired; telemetry --check exit 0. Cross-family panel PASS, receipt
`8d1fb133a7c1d16d` (families meta[groq] + mistral — 2 distinct).

## Recommendation
Merge. AC3 is complete; parent #3800 stays OPEN for AC4 (shadow-FP promotion) and AC5 (optional
historical backfill).
