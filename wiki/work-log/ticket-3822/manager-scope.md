# #3822 — Manager Scope: baseline-cutover tooling (ticket-3801 AC4 / ticket-3818 closeout child, Mode C)

**Type:** feature/closeout · **Area:** governance/scripts · **Priority:** P1
**Refs (bare):** ticket-3801 AC4 (dirty-checkout clean), ticket-3818 closeout child; design receipt
3355d17ac42b51ae; ticket-3819 sentinel Mode A; ticket-3789 dark-launch; validator-discipline ticket-1893.

## Objective
Deliver Mode C (CUTOVER) TOOLING of the ratified reconciler: make the canonical checkout's git status
clean (ticket-3801 AC4) by reconciling its tracked baseline to the already-byte-identical origin/main
content, under a hard BYTE-IDENTITY INVARIANT and blue-green reversibility. The tool is dry-run-first
and the live execute is GATED (carve-out); it does not itself perform an irreversible env change without
an explicit gate.

## Design (byte-identity invariant; dry-run-first; reversible)
scripts/baseline-cutover.js:
- pure classifyCutover(entries) -> buckets {safe (working bytes == origin/main), blocker (diverges;
  e.g. a documented hold), absent}; deterministic, unit-tested.
- plan(root) -> best-effort: for each tracked-modified + newly-tracked drifted path, compare working
  bytes to origin/main (git cat-file) -> {ready, safeCount, blockers[]}. CI-safe (clean tree -> ready).
- dryRun(root) -> report only; NEVER mutates. Default CLI mode.
- execute(root, {confirm}) -> gated: refuses unless confirm token AND every path is byte-identical
  (invariant) AND guard self-tests pass (health gate); snapshots pre-state; on any hash change or
  health-gate failure -> abort + rollback. NOT run in CI; requires explicit operator flag.
- selfTest() + --self-test; sibling spec + registry entry; CI runs self-test + dry-run only.

## Acceptance criteria
- [ ] AC1 pure classifyCutover partitions safe vs blocker deterministically; unit-tested.
- [ ] AC2 byte-identity invariant enforced before any mutation; blockers (holds) reported not clobbered.
- [ ] AC3 dryRun never mutates; CI-safe (clean tree -> ready, exit 0).
- [ ] AC4 execute is gated (confirm token + invariant + health gate + rollback); default OFF; not in CI.
- [ ] AC5 sibling spec + registry + CI (self-test + dry-run); enforcement-wiring-audit ENFORCED.
- [ ] AC6 free >=2-family cross-model consensus; receipt recorded.

## Rails
Tooling is reversible/autonomous. The LIVE re-park execution on the canonical checkout is a retained
carve-out (irreversible/security) — dry-run + evidence + human go/no-go before any live flip. This PR
ships tooling only and does NOT execute the cutover, so it does NOT yet Close ticket-3801/ticket-3818.
