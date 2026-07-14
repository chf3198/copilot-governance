# Collaborator validation — #3803 governance-verify enforceable + wired

> **Baton role**: COLLABORATOR | **ticket**: #3803 | **branch**: fix/3803-governance-verify-enforceable

## Change

| File | Change |
| --- | --- |
| `scripts/governance-verify.js` | Refactor to exported `verify(root, {now})`; CLI preserved under `require.main`. Merge-queue check made **presence-tolerant** (absent legacy `lint.yml`/`branch-name.yml` no longer a failure; present-but-`merge_group`-less still flagged). CLI layout root fixed to the repo root (`__dirname/..`, was `__dirname/../..` = repo parent); `GOVERNANCE_ROOT` env override. |
| `scripts/governance-verify.spec.js` | **New.** 7 self-executing assertions (Node `assert`) over hermetic fixture roots. |
| `inventory/harness-self-test-registry.json` | +1 entry `governance-verify`. |
| `.github/workflows/governance-verify.yml` | **New.** CI job: self-test (hard) + repo verify (hard). |

## Root cause fixed

`governance-verify` was the sole UNWIRED validator (enforcement-wiring-audit / #3802) and could not be
wired as-is: on the flat layout its merge-queue check hard-required two workflow files that never existed
in this repo → two false `missing workflow file` issues → exit 1. The CLI also resolved its root to the
repo's *parent*, so it inspected nothing. Both corrected; advisory blocks (ownership #2345, epic-child
#3800) unchanged and still scan the flat mirror.

## Verification gates (all green)

1. `node scripts/governance-verify.spec.js` → **exit 0**, 7 assertions. Covers: (a) present workflow
   missing `merge_group` flagged; (b) present with `merge_group` clean; (c) **absent legacy workflow NOT
   flagged** (the #3803 regression); (d) ticket missing Priority flagged + well-formed ticket clean;
   empty-root no-throw; this repo root → pass.
2. `node scripts/governance-verify.js` on the real flat repo → **PASS (exit 0)** (was FAIL/exit 1).
3. Hermetic clean-tree `git archive`→`.git`-less run: spec **exit 0**, CLI **exit 0** (Node built-ins only).
4. Loop closed: `node scripts/enforcement-wiring-audit.js` → **19/19 enforced, 0 UNWIRED**;
   `governance-verify` classified ENFORCED via workflow + self-test-registry.

## Intent preservation

The presence-tolerant change is a **correctness fix, not a weakening**: the `merge_group` assertion still
fires for any merge-queue workflow that exists. Only the mandatory *existence* of two legacy filenames —
which are not part of this repo and produced pure false positives — was dropped. Ratified by cross-family
panel (receipt `daa2a1f27e79e6e4`).
