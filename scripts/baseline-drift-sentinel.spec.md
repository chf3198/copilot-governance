# baseline-drift-sentinel — spec (#3819 · ticket-3801 AC5 / ticket-3818 closeout Mode A)

The DETECT mode of the ratified baseline-drift reconciler (design receipt `3355d17ac42b51ae`).
**Advisory-first, level-triggered, idempotent.** It measures how far the live working tree has diverged
from the committed baseline so the ticket-3801 764-file pile-up "never re-accumulates silently." It enforces
nothing and never blocks; promote-to-blocking is a deferred soak follow-up (GitOps "tighten exclusions
over time"; ticket-3800/ticket-3804 advisory→blocking precedent).

## API
- `classifyDrift(paths, opts?) → {total, ignored[], actionable[]}` — **pure**, unit-tested. Partitions
  porcelain paths into *ignored* (expected-mutation allowlist) vs *actionable*. `opts.isExpectedMutation`
  injectable.
- `isExpectedMutation(path) → bool` — ephemeral runtime files (`.megingjord/`, `.copilot/`, `.claude/`,
  `session.id`, `session_baseline`, `governance_state`, `state_store`, `runtime_session`,
  `tool_activity`, `incidents.log`, `friction-events`). Parity with `session_baseline.is_expected_mutation`
  (ticket-3820) — the GitOps "ignore expected mutations" / helm-diff annotation-ignore pattern.
- `collect(root) → string[]` — best-effort `git status --porcelain -uall`; `[]` on clean tree OR any
  failure (CI-safe, hermetic).
- `report(root, {threshold?}) → {driftTotal, ignored, actionable, threshold, beyondThreshold, sample}` —
  the advisory result; never throws, never blocks. `beyondThreshold` flips when actionable > threshold
  (default 25).
- `selfTest()` — hard-gate assertions (run by `baseline-drift-sentinel.spec.js` and the CI job).

## Invariants
1. **CI-safe:** a clean checkout ⇒ `driftTotal 0`, `beyondThreshold false`, exit 0.
2. **Advisory-only in governance-verify:** contributes a `hint` (never an `issue`); env `BASELINE_DRIFT_ADVISORY=0` silences.
3. **Idempotent/level-triggered:** recomputed from current state each run; twice == once.
4. **Allowlist parity** with the ticket-3820 hook allowlist so drift and conflict classification agree on what is ephemeral.

## Enforced root
`.github/workflows/baseline-drift-sentinel.yml` runs the spec (hard gate) + advisory self-report, making
`scripts/baseline-drift-sentinel.js` ENFORCED (enforcement-wiring-audit) with a sibling spec + registry
entry (validator-discipline ticket-1893).

## Not in scope (later)
Mode B (capture) and Mode C (cutover / ticket-3801 AC4) — the live cutover is a gated carve-out.
