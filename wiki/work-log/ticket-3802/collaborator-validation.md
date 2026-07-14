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
Reachability flows forward through `require('./x')` edges parsed from both `<n>.js` and `<n>.spec.js`,
so a helper pulled in only by an enforced spec still counts. **UNWIRED** = reachable from no root.
Disjoint from #1893 validator-discipline (which checks spec + registry *presence*, not *invocation*).

## Verification gates (all green)

1. `node scripts/enforcement-wiring-audit.spec.js` → **exit 0**, 5 assertions pass.
2. Hermetic clean-tree archive (`git archive | tar -x` into `.git`-less dir, Node built-ins only) →
   spec **exit 0**; CLI **exit 0**.
3. `node scripts/enforcement-wiring-audit.js` on the real tree → deterministic
   **7/19 enforced, 12 UNWIRED** (post-wiring). Self-validator classified ENFORCED via
   workflow + self-test-registry roots. Known-good anchors: `validator-discipline` (workflow),
   `signer-alias` (registry) enforced; `governance-verify`, `accountable-team-verify` UNWIRED.
4. Advisory-first confirmed: CLI returns exit 0 even with a non-empty unwired list.

## Baseline burndown surface (informational, not fixed here — non-goal)

12 validators reachable from no enforced root: asserted-vs-observed-probes, baton-artifact-builder,
baton-artifact-schema, baton-comment-build, baton-progression-parity, event-schema-otel-genai,
event-schema-v3, friction-event, governance-verify, label-lint-close-protection, log-redaction,
review-point-checkpoint. These are the E1 §4.iii "reconciled-to-done but never enforced" burndown items.
