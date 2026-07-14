# Consultant Closeout — #3800

- **Role**: Consultant | **Branch**: `feat/3800-wire-advisory` | **PR**: #12
- **Signed-by**: Curtis Franks | **Team&Model**: claude-code:opus-4.8@anthropic | 2026-07-14
- **Independent of**: builder role (advisory-first critique; no implementation changes made here)

## Scope reviewed

The reconcile delta for #3800: wiring the pre-merged Phase-0 bundling-drift detector into
`governance-verify.js` (AC2) + docs (AC6) + spec wiring-contract test + mirror-ticket updates.

## Findings

1. **Correctness — advisory is non-blocking (verified).** The new section is `try/catch`-wrapped,
   env-gated (`EPIC_CHILD_BATON_ADVISORY=0`), and appends only to `remediationHints` /
   `epicChildBatonAdvisories` — never to `issues`. Proven by exit-code parity: default and kill-switch
   runs both exit identically. **No risk of a false Epic-close block.** ✅
2. **Hermeticity (verified).** 9/9 spec on a clean `.git`-less archive, node built-ins only; the
   wiring-contract test pins the `{auditEpics, scanMirror}` interface so a future rename can't silently
   break the require. ✅
3. **Scope honesty (accept).** AC1/AC2/AC6 land; AC3/AC4/AC5 are explicitly left OPEN as Phase-1
   backlog and the Epic is **not** falsely marked DONE. This is the correct disposition — merging the
   wiring avoids the "reconciled-to-done guard that never enforces" anti-pattern **without** overstating
   completion. ✅
4. **Corpus-count caveat (noted, non-blocking).** The ticket's "~640 warnings" figure was measured
   against the live *untracked* mirror corpus; a tracked-only archive shows 0. This is documented in
   the updated `3800.md` (measurement provenance), so no drift. The unit regression (#2345 family → 0)
   is the durable proof of correctness. ℹ️
5. **Promotion gate intact.** Advisory→blocking promotion still requires the AC4 shadow FP-metric + a
   ≥2-family consensus (unchanged). No premature hardening. ✅

## Risk score

**LOW.** Additive, advisory-only, verdict-preserving, reversible on unprotected `main`. No security,
privacy, or C-G1/C-G4 concern (the change strengthens governance observability without new authority).

## Recommendation

**ACCEPT / merge.** Consensus receipt `dfb39ecb93c72857` (meta/groq + mistral, PASS) corroborates.
Follow-on: file/track AC3 (close-time hint) and AC4 (shadow metric) as the next Phase-1 pick.

## CONSULTANT_CLOSEOUT

Ratified: reconcile #3800 Phase-0 → wired advisory. LOW risk, ACCEPT. Cross-family PASS
`dfb39ecb93c72857`. Epic remains OPEN for Phase-1 (AC3/AC4/AC5).
