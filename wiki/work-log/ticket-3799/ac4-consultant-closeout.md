---
title: "#3799 AC4 — completion-gate hardening: CONSULTANT closeout"
type: baton-consultant
ticket: 3799
ac: 4
role: consultant
lane: code-change
created: "2026-07-15"
accountable-team: claude-code
---
# #3799 AC4 — CONSULTANT closeout (independent critique)

CONSULTANT_CLOSEOUT

## Verdict: ACCEPT (advisory-first, low-risk, reversible)

Independent post-execution critique of the AC4 completion-gate hardening.

### What was verified

- **Root cause addressed.** The AC4 criterion is that the gate check the *committed deliverable*
  (clean + CI-green), not working-tree drift. `evaluateCompletion` blocks ONLY on
  `committedClean !== true` or `ciStatus !== 'green'`; `untrackedCount` / `unrelatedModifiedCount`
  are structurally routed to `ignoredDrift`. The `718-untracked` case is a direct spec assertion and
  passes. The false positive cannot recur through this predicate.
- **Reuse, not reinvention.** The remaining-step disposition delegates to
  `autonomy-classifier.classifySteps` (AC2) rather than duplicating the reversible/carve-out taxonomy —
  correct per the ticket's explicit "MUST REUSE the AC2 classifier" instruction. Protected-merge and
  security-weakening remaining steps correctly surface as carve-out-remaining/ESCALATE.
- **Low false-positive advisory.** The `Completion-Gate:` audit is present-marker-only (CG1/CG2); a
  markerless doc yields nothing, and prose about "carve-out"/"untracked" is not keyword-matched — so
  the docs that *discuss* the false positive (including this baton set) do not self-flag. Live corpus:
  0 findings.
- **Enforcement + hermeticity.** 24/24 enforced, 0 unwired; telemetry baseline moved; clean-tree
  archive run of both specs green; advisory never contributes to `issues`.
- **Independent panel.** Cross-family PASS, receipt `fb0f352d56b47e0a` (meta + mistral).

### Risk assessment

- Blast radius: additive-only. One new pure/advisory validator + one try/catch advisory block in
  `governance-verify` guarded by `COMPLETION_GATE_ADVISORY`. Cannot change any pass/fail verdict.
- Reversibility: full — squash-merge to unprotected mirror `main` is `git revert`-able.
- Residual (non-blocking): the gate predicate is a library other tooling/hooks can adopt; wiring it
  into the *external* harness stop-hook is out of AC4 scope (Non-goals) and left for a follow-up if
  the operator wants the hook text itself to consume this predicate.

### Recommendation

Merge autonomously (reversible). AC4 checkbox → done; parent #3799 has only AC5 (consensus) remaining,
whose taxonomy + hermetic-path were already ratified (receipts `da77d7d9f172fa81` + `35d7328999ec3357`)
— parent can close after flipping AC5.
