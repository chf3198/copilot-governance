---
title: "#1893 baton — validator-discipline gate (Collaborator → Admin → Consultant)"
type: work-log
ticket: 1893
branch: feat/1893-validator-discipline
created: "2026-07-14"
---
# #1893 — Baton artifacts

## COLLABORATOR (validation evidence)

Deliverable (files, all in-scope for #1893):
- `scripts/validator-discipline.js` — pure `auditChangedFiles(files, registry)` + advisory CLI.
- `scripts/validator-discipline.spec.js` — 11 assertions.
- `inventory/harness-self-test-registry.json` — recursive self-test registry.
- `.github/workflows/validator-discipline.yml` — `pull_request [opened, synchronize]` gate.

Evidence:
- **G-A** `node scripts/validator-discipline.spec.js` → **11 passed, 0 failed**.
- **G-B (hermetic)** `git archive feat/1893-validator-discipline | tar -x -C /tmp/ci-1893 && node
  scripts/validator-discipline.spec.js` on a **.git-less** tree → **11 passed, 0 failed**. Node
  built-ins only; no gh/network/untracked deps.
- CLI smoke: `--files=scripts/new-thing-validator.js` → emits VD1 + VD2 (advisory, exit 0).
- Dogfood: the ticket's own changeset audits to **0 violations** (validator ships its own spec +
  registry entry, AC7).

AC coverage: AC1 (diff-driven CLI, `--base`/`--files`), AC2 (validator detection + SUPPORT_ALLOWLIST
exclusion), AC3 (workflow on pull_request opened/synchronize), AC4 (structured advisory output naming
each non-compliant validator), AC5 (advisory-first: CLI always exit 0; promotion path documented),
AC6 (a/b/c/d cases + FP-avoidance tests), AC7 (recursive registry entry + dogfood test).
Scope adaptation to origin/main flat layout documented in `manager-scope.md`.

## ADMIN (handoff)

- Autonomy decision (G8): merge target is **unprotected `main`** on a mirror repo; feature-branch
  push + PR + merge are **reversible** ⇒ completed **autonomously** (no carve-out; carve-outs are
  design/UAT/irreversible/security-weakening — none apply; the gate is advisory, weakens nothing).
- Cross-family consensus: **PASS**, receipt `6ce4bfd553876ec0`, families [meta (groq), mistral]
  (≥2 distinct, non-authoring), authoringFamily anthropic, kind review.
- Mirror-mode: no live GitHub issue (#1893 is wiki-mirror; real issue space ≤ #5). PR body cites the
  mirror path `wiki/work-log/tickets/1893.md` in lieu of `Closes #N`; mirror status flipped on merge.
- Merge vehicle: PR from `feat/1893-validator-discipline` → `main`; squash-merge after CI green.

## CONSULTANT (closeout)

- Independent check: hermetic G-B run on a clean checkout reproduces green ⇒ the gate is not
  dependent on the authoring worktree. Cross-family PASS ratifies scope + advisory-first disposition.
- Risk: LOW. Advisory-only (exit 0) ⇒ cannot brick a session or block an unrelated PR. The one hard
  step (self-test spec in CI) only fails if the validator's own regression breaks — correct.
- Residual / follow-on (not blocking): AC5 promotion advisory→required after a low-FP soak against a
  historical megalint-touch corpus; backfill remaining existing validators into the registry.
- Verdict: **RELEASE.**
