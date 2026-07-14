---
title: "#3804 — MANAGER_SCOPE: enforcement-surface telemetry (E1 +telemetry)"
type: work-log
role: role:manager
ticket: 3804
lane: lane:code-change
created: "2026-07-14"
status: OPEN
---

# #3804 — Manager scope: enforcement-surface telemetry (E1 `+telemetry`)

> **Source**: local wiki-mirror (no live GitHub issue; real issue space maxes at #5) | **state: OPEN**
> **Labels**: type:anneal, status:in-progress, priority:P2, area:governance, area:scripts,
> area:observability, lane:code-change
> **Epic/lane**: Drift-Remediation Roadmap → **E1** (burn down "reconciled-to-done" guardrails +
> make enforcement observable). Direct successor-complement to #3802 (enforcement-wiring-audit
> detector) and #3803 (governance-verify enforceable).

## Trigger / provenance

E1 delivered *classification* of the enforcement surface: #3802's `enforcement-wiring-audit`
labels every `scripts/*.js` validator ENFORCED vs UNWIRED, and #3803 made `governance-verify`
itself enforceable (19/19 enforced, 0 UNWIRED at 54bcb0c). What E1 still lacks is **observability
over time** (G8): a one-shot audit tells you the count *now*, but nothing records it, nothing warns
when the enforcement surface *regresses* (a newly-added validator lands UNWIRED, or a wired one is
orphaned). Silent regression of the enforcement surface is exactly the "reconciled-to-done but never
enforced" drift class E1 exists to defeat — it just reappears one validator at a time. `+telemetry`
closes that gap.

## Deliverable (enforcement-first)

A wired, non-bypassable **enforcement-surface telemetry** capability:

1. `scripts/enforcement-telemetry.js` — pure module `collect(root)` that consumes
   `enforcement-wiring-audit.audit(root)` and returns a normalized, stable telemetry record:
   `{ schemaVersion, checkedValidators, enforcedCount, unwiredCount, unwired: [names…],
   enforcedRatio }`. CLI: `--json` prints the record; default prints a one-line summary; exit 0
   (advisory-first, §3g).
2. **Regression guard** — `--check-regression [--baseline <path>]` compares `unwiredCount` against a
   committed baseline (`inventory/enforcement-telemetry-baseline.json`); prints an advisory WARNING
   when the enforcement surface regressed (unwiredCount rose vs baseline, or a previously-enforced
   validator is now unwired). `--update-baseline` rewrites the baseline. Exit 0 (advisory-first).
3. **Wiring** — a default-on advisory sub-check inside `governance-verify.verify(root)` matching the
   existing idiom (env gate `ENFORCEMENT_TELEMETRY_ADVISORY!=='0'`, try/catch, NEVER contributes to
   `issues`): adds an `enforcementTelemetry` field to the result and a `remediationHints` entry when
   `unwiredCount>0`. governance-verify is CI-enforced (#3803), so the telemetry always runs and cannot
   be silently bypassed.
4. **Validator-discipline (#1893)** — sibling `scripts/enforcement-telemetry.spec.js` (Node built-in
   `assert`, self-executing, exit 1 on fail) + an `inventory/harness-self-test-registry.json` entry.
5. **Hermetic** — Node built-ins + in-repo `require('./enforcement-wiring-audit')` only; no network,
   no `gh`, no untracked deps. Clean-tree `git archive | tar -x` regression run GREEN.

## Acceptance criteria

- [ ] AC1 `enforcement-telemetry.js` exports `collect(root)` returning the normalized record derived
      from `audit()`; `--json` / default CLI both exit 0.
- [ ] AC2 `--check-regression` warns (advisory) when `unwiredCount` rose vs the committed baseline OR
      a previously-enforced validator became unwired; `--update-baseline` writes the baseline; both
      exit 0.
- [ ] AC3 wired into `governance-verify.verify()` as a default-on advisory sub-check that never alters
      the pass/fail verdict (never touches `issues`); silenceable via `ENFORCEMENT_TELEMETRY_ADVISORY=0`.
- [ ] AC4 sibling spec + registry entry present; `validator-discipline` and
      `enforcement-wiring-audit` both still report the new validator ENFORCED (0 UNWIRED preserved).
- [ ] AC5 hermetic clean-tree archive run of the spec suite (+ governance-verify spec) is GREEN.
- [ ] AC6 design + advisory-first taxonomy ratified by a free ≥2-distinct-family cross-model panel
      (`cross-family-consensus.js`); receipt recorded.

## Non-goals

- Promoting any telemetry warning to a hard merge block (advisory-first; promote only after a
  low-FP soak — §3g).
- Reconciling the `#N` mirror universe to real GitHub issues.
- A persistent time-series store / dashboard; the JSONL emit + committed baseline snapshot is the
  scope. Weakening C-G1/C-G4 is out of scope.

## Verification gates (Collaborator must produce)

- `node scripts/enforcement-telemetry.spec.js` → all `ok -`, exit 0.
- `node scripts/enforcement-telemetry.js --json` → valid record; `unwiredCount === 0` on this tree.
- `node scripts/enforcement-wiring-audit.js` → still reports the new validator ENFORCED.
- `node scripts/validator-discipline.js` → passes (spec + registry entry present).
- Clean-tree archive: `git archive feat/3804-enforcement-telemetry | tar -x -C /tmp/ci-3804 &&
  (cd /tmp/ci-3804 && node scripts/enforcement-telemetry.spec.js && node scripts/governance-verify.spec.js)`
  → GREEN.

## Baton plan

Manager (this) → Collaborator (implement + specs + wiring + baseline) → Admin (push → PR → CI green
→ merge to unprotected main; reversible ⇒ autonomous per #3799 AC2 taxonomy) → Consultant
(independent critique + cross-family consensus receipt).

Related: #3802 (enforcement-wiring-audit), #3803 (governance-verify enforceable), #1893
(validator-discipline), #3800 (advisory-wiring idiom), #2345 (advisory-wiring idiom), #3799
(reversible-completion default).
