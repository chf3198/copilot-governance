# Collaborator validation — #3802 enforcement-wiring-audit

> **Baton role**: COLLABORATOR | **ticket**: #3802 | **branch**: feat/3802-enforcement-wiring-audit

## Deliverable

| File | Purpose |
| --- | --- |
| `scripts/enforcement-wiring-audit.js` | Audit validator: classify each non-spec `scripts/*.js` as ENFORCED / UNWIRED by enforced-root reachability. CLI advisory-first (exit 0) + `require()`-able module. |
| `scripts/enforcement-wiring-audit.spec.js` | Self-executing regression spec (Node `assert`); hermetic fixture-tree classification tests + real-tree partition invariant. Exit 1 on regression. |
| `inventory/harness-self-test-registry.json` | +1 entry `enforcement-wiring-audit` (satisfies #1893 discipline; makes the audit itself a self-test regression). |
| `.github/workflows/enforcement-wiring-audit.yml` | Advisory CI job: self-test (hard) + unwired burndown (advisory, exit 0) on every PR to main. |

## Model — enforced-root reachability

A validator (`scripts/<n>.js`, non-spec) is **ENFORCED** iff `<n>` is reachable from an *enforced root*:
- `.github/workflows/*.yml` job step,
- `.github/scripts/*.sh` or `.githooks/*` hook script,
- `inventory/harness-self-test-registry.json` entry (by `name` or spec ref).

"Reference" = the root text names `scripts/<n>.js` or `scripts/<n>.spec.js` (registry also by `name`).
Reachability flows forward through **outgoing edges** parsed from both `<n>.js` and `<n>.spec.js`:
`require('./x')` / `require('./x.js')` (extension-tolerant) **and** `scripts/x.js` path-string references
(e.g. `spawnSync('node', ['scripts/x.js'])`), so a helper pulled in by an enforced spec — whether by
require or by child_process spawn — still counts. **UNWIRED** = reachable from no root. Disjoint from the
validator-discipline gate (which checks spec + registry *presence*, not *invocation*).

## Verification gates (all green)

1. `node scripts/enforcement-wiring-audit.spec.js` → **exit 0**, 5 assertions pass.
2. Hermetic clean-tree archive (`git archive | tar -x` into `.git`-less dir, Node built-ins only) →
   spec **exit 0**; CLI **exit 0**.
3. `node scripts/enforcement-wiring-audit.js` on the real tree → deterministic
   **18/19 enforced, 1 UNWIRED** (post-wiring). Self-validator classified ENFORCED via
   workflow + self-test-registry roots. Known-good anchors: `validator-discipline` (workflow) and
   `signer-alias` (registry) enforced; the baton closure (`baton-comment-build`,
   `label-lint-close-protection`, `baton-progression-parity`, `baton-artifact-builder`, …) enforced
   **transitively** via the `baton-e2e.spec.js` CI fixture (require + spawn edges); `governance-verify`
   UNWIRED.
4. Advisory-first confirmed: CLI returns exit 0 even with a non-empty unwired list.

## Edge-model completeness note (post-review fix)

Initial draft used a `require('./x')`-only closure and scanned path strings only in enforced roots. That
produced **false positives** (12 "unwired") because the enforced `baton-e2e.spec.js` fixture loads its
tooling via `require('./x.js')` (extension form) and `spawnSync('node',['scripts/x.js'])` (child_process).
The edge model was corrected to be extension-tolerant and to follow `scripts/x.js` path-strings in reached
bodies. This is a *completeness bugfix within the same ratified reachability taxonomy*, not a design
change — corrected result: **1 UNWIRED**. Regression spec extended to cover both edge forms.

## Baseline burndown surface (informational, not fixed here — non-goal)

**1 validator** reachable from no enforced root: `governance-verify` — the primary ticket/workflow
governance validator is invoked by no CI workflow, git hook, or self-test registry entry. This is the
E1 §4.iii "reconciled-to-done but never enforced" burndown item. Wiring it (e.g. adding a
`governance-verify` CI job or registry self-test) is downstream burndown work — its own ticket.
