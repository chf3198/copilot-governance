# CONSULTANT_CLOSEOUT — #3799-AC2

- **Role:** Consultant (independent critique)
- **AC:** #3799 AC2 — reversible-vs-carveout autonomy classifier
- **Cross-family receipt:** `da77d7d9f172fa81` (PASS; meta[groq] + mistral) — doubles as AC5 ratification of the taxonomy.

## Assessment

The deliverable implements exactly the AC2 taxonomy with no scope creep into AC4.
The classifier is the reusable predicate the operator-autonomy principle needs at
the merge boundary; it encodes the operator's own correction (unprotected-main
push/PR/merge is reversible, the retained carve-out is protected/production/
irreversible/security-weakening).

### Correctness

- **Fail-safe verified:** unknown protection, unknown action, empty, and `null`
  all classify as carve-out — the taxonomy can only ever *over*-escalate, never
  *under*-escalate, so it cannot weaken a genuine carve-out (the AC's explicit
  non-goal). Spec asserts every branch.
- **Security dominance verified:** `securityWeakening` overrides an otherwise
  reversible action (C-G4 respected).
- **Advisory is low-FP by design:** it validates only logged Autonomy-Decision
  markers; docs without a marker are untouched. 0 findings on the live corpus —
  no false-positive storm, unlike a free-text keyword scanner would have produced.
- **Non-blocking wiring verified:** default-on, `AUTONOMY_CLASSIFIER_ADVISORY=0`
  silences, try/catch, never contributes to `issues`; 23/23 enforced, 0 unwired.
- **Hermetic:** both specs green on a clean `.git`-less archive tree.

### Risk

- Correctness LOW (pure fn, exhaustive spec). Blast radius LOW (advisory-only,
  no enforced surface change beyond +1 wired validator). FP LOW (0 on corpus).

### Recommendation

**ACCEPT / RELEASE.** Parent #3799 stays OPEN — **AC4** (completion-gate hardening
that *messages* with this taxonomy: "reversible-remaining vs carve-out-remaining")
is the natural next follow-on and now has the predicate it needs. This Admin
handoff also dogfoods the `Autonomy-Decision:` marker, seeding adoption of the
convention the AUT advisory rewards.
