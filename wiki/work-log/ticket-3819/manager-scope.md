# #3819 — Manager Scope: baseline-drift-sentinel (ticket-3801 AC5 / ticket-3818 closeout, Mode A)

**Type:** feature/guardrail · **Area:** governance/scripts · **Priority:** P1
**Refs (bare):** ticket-3801 AC5, ticket-3818 closeout child; design receipt 3355d17ac42b51ae;
lineage ticket-3800/ticket-3804 advisory-to-blocking; ticket-3789 dark-launch; validator-discipline ticket-1893.

## Objective
Deliver Mode A (DETECT) of the ratified baseline-drift reconciler: a wired, advisory-first sentinel that
flags when the live install diverges from the committed baseline beyond a threshold, so the ticket-3801
764-file pile-up never re-accumulates silently. Modes B (capture) and C (cutover) are separate later
work; the live cutover is a gated carve-out.

## Design (inverted GitOps; level-triggered; idempotent)
scripts/baseline-drift-sentinel.js:
- pure classifyDrift(paths, opts) -> buckets {ignored (expected-mutation allowlist), actionable};
- collect(root) -> git status --porcelain -uall (best-effort; [] on clean/failure -> CI-safe);
- report(root, {threshold}) -> advisory {driftTotal, ignored, actionable, beyondThreshold} (exit 0 always);
- selfTest() + --self-test CLI (hard-gate spec).
Wired advisory-only into governance-verify.js (never contributes to issues; env-silenceable) + a CI job
(self-test hard gate + advisory self-report) + sibling spec + registry entry (validator-discipline ticket-1893).

## Acceptance criteria
- [ ] AC1 pure classifyDrift buckets paths via the expected-mutation allowlist; deterministic, unit-tested.
- [ ] AC2 collect/report CI-safe: clean tree -> 0 drift -> exit 0; never blocks.
- [ ] AC3 advisory-first wiring into governance-verify (no issues contribution) + CI self-test gate.
- [ ] AC4 sibling spec + harness-self-test-registry entry; enforcement-wiring-audit sees it ENFORCED.
- [ ] AC5 threshold + beyondThreshold metric; promote-to-blocking deferred to a soak follow-up.
- [ ] AC6 free >=2-family cross-model consensus; receipt recorded.

## Rails
Advisory-first, reversible, autonomous per operator directive. Does NOT execute any cutover or mutate
the canonical checkout. Content-only new tooling.
