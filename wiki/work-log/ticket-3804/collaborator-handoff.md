---
title: "#3804 — COLLABORATOR_HANDOFF: enforcement-surface telemetry"
type: work-log
role: role:collaborator
ticket: 3804
created: "2026-07-14"
status: OPEN
---

# #3804 — Collaborator handoff

## Deliverables (commit `c1db138`)

| File | Change |
|---|---|
| `scripts/enforcement-telemetry.js` | NEW — `collect(root)`, `compareBaseline(cur,base)`, CLI (`--json` / `--emit` / `--check-regression` / `--update-baseline`); advisory-first (exit 0). |
| `scripts/enforcement-telemetry.spec.js` | NEW — 10 self-executing checks (Node `assert`); exit 1 on fail. |
| `inventory/enforcement-telemetry-baseline.json` | NEW — committed baseline: 20/20 enforced, 0 unwired, ratio 1. |
| `scripts/governance-verify.js` | wired default-on advisory sub-check (`ENFORCEMENT_TELEMETRY_ADVISORY`); adds `enforcementTelemetry` + unwired hint; never touches `issues`. |
| `inventory/harness-self-test-registry.json` | added `enforcement-telemetry` entry (validator-discipline #1893). |

## Validation evidence

- `node scripts/enforcement-telemetry.spec.js` → **10 checks passed**, exit 0.
- `node scripts/enforcement-telemetry.js --json` → `{checkedValidators:20, enforcedCount:20, unwiredCount:0, unwired:[], enforcedRatio:1}`.
- `node scripts/enforcement-wiring-audit.js` → **20/20 enforced, 0 UNWIRED** (the new validator is itself enforced via governance-verify require + registry entry — self-check holds).
- `node scripts/validator-discipline.js` → OK (spec + registry entry present).
- `node scripts/governance-verify.spec.js` → 7 assertions passed (no regression from the wiring).
- `node scripts/enforcement-wiring-audit.spec.js` → 5 assertions passed.
- `node scripts/enforcement-telemetry.js --check-regression` → `ok - enforcement surface not regressed vs baseline`, exit 0.

## Hermetic clean-tree proof (§3c)

```
git archive feat/3804-enforcement-telemetry | tar -x -C /tmp/ci-3804   # .git-less tree
cd /tmp/ci-3804
node scripts/enforcement-telemetry.spec.js        # EXIT=0
node scripts/governance-verify.spec.js            # EXIT=0
node scripts/enforcement-wiring-audit.spec.js     # EXIT=0
node scripts/enforcement-telemetry.js --check-regression   # 20/20, not regressed
```
GREEN — Node built-ins only; no network, no `gh`, no untracked deps.

## AC coverage

- AC1 ✓ `collect()` normalized record; `--json`/default exit 0.
- AC2 ✓ `--check-regression` (count-rise + same-count swap) and `--update-baseline` exit 0.
- AC3 ✓ wired as default-on advisory; never alters pass/fail; env-silenceable.
- AC4 ✓ spec + registry entry; surface stays 0-unwired incl. this validator.
- AC5 ✓ hermetic clean-tree archive run GREEN.
- AC6 → Consultant (cross-family consensus).
