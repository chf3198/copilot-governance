---
title: "#3804 — CONSULTANT_CLOSEOUT: enforcement-surface telemetry"
type: work-log
role: role:consultant
ticket: 3804
created: "2026-07-14"
status: OPEN
cross_family_receipt: a566f04709bccb6d
---

# #3804 — Consultant closeout

## Independent critique

**Scope fidelity.** Deliverable matches the Manager scope: observability + regression guard over the
enforcement surface, advisory-first, wired into the CI-enforced `governance-verify` (#3803) so it
cannot be silently bypassed. No scope creep (no dashboard / time-series store — deferred as non-goal).

**Correctness of the regression semantics.** `compareBaseline` flags a regression on (a) unwired
count rising and (b) a same-count swap where a previously-enforced validator becomes unwired — the
latter catches the subtle "one wired, one orphaned, net-zero count" drift that a naive count-compare
misses. Verified by dedicated spec cases. Improvement (count drops) is correctly NOT a regression.

**Advisory-first / non-weakening.** The governance-verify sub-check is wrapped in try/catch, gated by
`ENFORCEMENT_TELEMETRY_ADVISORY`, and NEVER contributes to `issues` — the pass/fail verdict is
provably unchanged (governance-verify.spec still green). CLI paths all exit 0. G4/C-G1 not weakened.

**Hermeticity.** `collect` audits `path.resolve(__dirname,'..')` (the real scripts/ tree), so it is
correct under throwaway ticket-fixture roots and on a `.git`-less archive tree. Node built-ins +
in-repo require only; clean-tree archive run GREEN.

**Self-consistency.** The new validator is itself enforced (governance-verify require + registry
entry), so `enforcement-wiring-audit` still reports 20/20 / 0-unwired — the ticket did not itself
introduce an unwired guardrail. The committed baseline reflects that clean state.

## Residual risk / follow-ups (non-blocking)

- Advisory-only by design (§3g). Promotion of `--check-regression` to a hard block should follow a
  low-FP soak; a FOLLOWUP could gate CI on regression once baselines prove stable across sessions.
- The baseline is a point-in-time snapshot; parallel sessions adding validators must run
  `--update-baseline` after wiring (documented in the module header + scope).

## Cross-family consensus

`node scripts/cross-family-consensus.js --ticket 3804 --kind review` →
**consensus: PASS**, receipt **`a566f04709bccb6d`**, families: **meta** (groq), **mistral** — 2
distinct non-authoring families, PASS/PASS. Authoring family: anthropic.

## Autonomy decision (G8)

Admin steps (feature-branch push → PR → CI → merge to **unprotected** `main`) are **reversible** per
the #3799 AC2 taxonomy → completed autonomously. No retained carve-out triggered (not
protected-main/production, not irreversible, not security-weakening).

## Verdict

**APPROVE — merge.** All ACs met; independent + cross-family validation PASS.
