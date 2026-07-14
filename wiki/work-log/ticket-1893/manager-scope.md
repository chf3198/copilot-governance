---
title: "#1893 Manager scope — validator-discipline gate"
type: work-log
role: manager
ticket: 1893
branch: feat/1893-validator-discipline
created: "2026-07-14"
---
# #1893 — Manager scope (baton entry contract)

## Problem (restated)
New validators can be added under `scripts/` without a test and without a self-test registry entry,
so a validator can "exist" while never running / never catching regressions (pattern instance:
2026-05-18 untracked `research-first-phase-gate.js` with no spec). Instructional governance is
insufficient for low-capability auto-mode models; a wired CI gate is required.

## Scope adaptation to origin/main reality
The ticket ACs reference `scripts/global/megalint/` + `tests/<name>.spec.js` +
`inventory/harness-self-test-registry.json`. origin/main uses a **flat** `scripts/` layout with
**sibling** `scripts/<name>.spec.js` specs and has **no** `inventory/` yet. Faithful adaptation:
- Validator file → `scripts/validator-discipline.js`
- Test file → sibling `scripts/validator-discipline.spec.js`
- Self-test registry → create `inventory/harness-self-test-registry.json` (the surface the ACs assume)
- Workflow → new `.github/workflows/validator-discipline.yml` on `pull_request`

## Deliverable (enforcement-first, non-bypassable)
1. `scripts/validator-discipline.js` — pure `auditChangedFiles(files, registry)` +
   advisory CLI (exit 0, matches harness norm). Flags any added/modified `scripts/*.js` **validator**
   (excludes `*.spec.js` and a SUPPORT_ALLOWLIST of non-validator modules) that lacks EITHER a
   sibling `scripts/<name>.spec.js` in the changeset OR an entry in the self-test registry.
2. `scripts/validator-discipline.spec.js` — Node built-in assert; covers AC6 (a)(b)(c)(d) + AC7 self.
3. `inventory/harness-self-test-registry.json` — tracked registry mapping validator → spec; includes
   validator-discipline itself (AC7 recursive) + the existing scanned validators.
4. `.github/workflows/validator-discipline.yml` — runs the spec (regression) and the validator against
   the PR diff (advisory comment surface) on `pull_request [opened, synchronize]`.

## Acceptance gates (verification contract)
- G-A: `node scripts/validator-discipline.spec.js` GREEN.
- G-B: **Hermetic** — `git archive feat/1893-validator-discipline | tar -x -C /tmp/ci-1893 &&
  (cd /tmp/ci-1893 && node scripts/validator-discipline.spec.js)` GREEN on a clean tree (node
  built-ins only; no gh/network/untracked deps).
- G-C: cross-family consensus PASS (≥2 distinct families) on the validator-scope + advisory-first
  disposition; receipt cited.
- G-D: PR → CI-green → merge to (unprotected) main; release claim; flip mirror status; MEMORY note.

## Constraints / autonomy (G8)
- Advisory-first (never block merge) initially, per AC5 promotion model. Reversible; unprotected main
  ⇒ complete autonomously (no carve-out). Touch ONLY #1893 files. Do NOT absorb the #3801 harness
  baseline drift (separate cleanup claim).
