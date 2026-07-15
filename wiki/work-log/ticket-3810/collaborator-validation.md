---
title: "#3810 — Collaborator validation"
type: work-log
created: "2026-07-15"
updated: "2026-07-15"
tags: [ticket-3810, collaborator, hooks, stop-hook, validation]
status: collaborator-complete
---
# #3810 — Collaborator validation evidence

Branch: `feat/3810-stop-session-attributable-impl` (off `origin/main`).
Role: Collaborator. Scope: `wiki/work-log/ticket-3810/manager-scope.md` (7 ACs).

## What changed (PR file set — 7 files)

| File | Kind | Change |
|---|---|---|
| `hooks/scripts/session_baseline.py` | NEW (tracked) | Pure/stdlib gate-decision module: snapshot, resolve (branch-aware), override, delta, `should_block`. |
| `hooks/scripts/session_baseline_test.py` | NEW (tracked) | 16 `unittest` cases — AC1/AC2/AC3/AC4 + guards. Stdlib-only, no hook deps. |
| `hooks/scripts/session_baseline.spec.md` | NEW (tracked) | Sibling spec (#1893). |
| `hooks/scripts/stop_checks.py` | first-time TRACKED + edit | `check_uncommitted` delegates the decision to `session_baseline.should_block`; message unchanged. New optional args `baseline_record`, `current_branch`, `admin_ops` (default `None` ⇒ legacy — AC7). |
| `hooks/scripts/stop_reminder.py` | tracked, edit | Passes `state['baseline_uncommitted']` + branch + `admin_ops` into `check_uncommitted`. |
| `hooks/scripts/session_context.py` | tracked, edit | SessionStart snapshots `git status --porcelain` + branch into `state['baseline_uncommitted']` (advisory, fail-safe). |
| `inventory/harness-self-test-registry.json` | edit | Registry entry `session-baseline` (#1893 discipline, AC5). |

Design: SessionStart records `state["baseline_uncommitted"] = {"branch": <b>, "paths": [...]}`.
Stop blocks only on the **delta** vs that baseline. Branch change resets it implicitly
(`resolve_baseline` returns `None` when recorded branch ≠ current). Unresolved baseline
(missing/malformed/branch-changed) ⇒ **legacy full-set block (fail-safe, never fail-open)**.
Override parity (#3054): `baseline_drift_override`/`merge_evidence_override` suppress the block.

## Acceptance criteria — evidence

- **AC1** baseline == standing drift ⇒ no block. Isolated `check_uncommitted` returned `None`;
  16/16 unit tests incl. `AC1BaselineEqualsDrift`; e2e: SessionStart recorded
  `{'branch':'feat/3026-canonical','paths':['standing_a.py','standing_b.js']}` and the pre-existing
  set did not fire the uncommitted gate.
- **AC2** new post-SessionStart file ⇒ still blocks. Integration: adding `new.py` returned
  `"Stop blocked: uncommitted changes; Admin baton incomplete."` with the file named in the message;
  `AC2NewFileStillBlocks` (incl. non-code + `.claude/` exclusions).
- **AC3** `baseline_drift_override` honored (parity #3054). Integration + `AC3OverrideParity`.
- **AC4** SessionStart records baseline deterministically; branch change resets; missing snapshot ⇒
  legacy block. `AC4BranchChangeAndFailSafe` (branch-mismatch, missing, malformed → block);
  `resolve_baseline` semantics test. e2e confirmed the SessionStart write.
- **AC5** sibling spec + registry entry present; 16 unit tests cover AC1–AC4; `py_compile` clean
  on all 4 changed hooks.
- **AC6** cross-family $0 consensus — see the review receipt appended by the Collaborator/Admin step.
- **AC7** no change to unrelated Stop conditions. Legacy 2-arg `check_uncommitted(uncommitted, roles)`
  is behavior-identical (`baseline_record=None ⇒ legacy`). client-arbitration / internal-conflict /
  admin-ops / wiki-pending code paths untouched.

## Validation commands (all green)

- `python3 -m py_compile session_baseline.py stop_checks.py stop_reminder.py session_context.py` → OK
- `python3 hooks/scripts/session_baseline_test.py` → **Ran 16 tests … OK**
- `node scripts/governance-verify.js` → **PASS (0 tickets)** (only pre-existing #3807 advisories)
- `node scripts/validator-discipline.js --base origin/main` → **OK — no unguarded validators**
- `node scripts/enforcement-wiring-audit.js` → **28/28 validators enforced, 0 UNWIRED**

## Isolated before/after proof (parked-checkout scenario)

```
PRE-FIX check_uncommitted (legacy 2-arg):  Stop blocked: uncommitted changes; Admin baton incomplete.
AC1 check_uncommitted (with baseline):     None
```

## ⚠️ Discovered adjacent gap — OUT OF #3810 SCOPE (AC7), needs a follow-up ticket

`stop_reminder.py` has a **second, independent** blocker that also fires on the parked checkout's
standing drift: `classify_internal_conflict(uncommitted)` (client_arbitration_guard) returns a
catch-all `worktree-drift` for ANY non-empty uncommitted set, and stop_reminder blocks on any
`type != "none"` (lines ~80-88). In the full-hook e2e, after the #3810 fix the block **reason
changed** from `"…uncommitted changes; Admin baton incomplete."` → `"…unresolved internal conflict
requires deterministic operator resolution."`. So #3810 correctly removes the uncommitted-gate
false positive (all 7 ACs met), but **full end-to-end unblock of the parked checkout additionally
requires making the `worktree-drift` classifier session-attributable** — the same disease, a
separate surface. Fixing it here would violate #3810 AC7 (no change to internal-conflict) and bundle
two tickets. Recommend a sibling follow-up ticket. Flagged to the operator.
