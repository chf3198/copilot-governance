---
title: "#3799 AC4 — completion-gate hardening: COLLABORATOR handoff"
type: baton-collaborator
ticket: 3799
ac: 4
role: collaborator
lane: code-change
created: "2026-07-15"
accountable-team: claude-code
---
# #3799 AC4 — COLLABORATOR handoff (build + evidence)

## Delivered

- **`scripts/completion-gate.js`** (new validator, pure + advisory):
  - `evaluateCompletion(ctx)` — the corrected gate predicate. Blockers are ONLY a dirty committed
    deliverable (`deliverable.committedClean !== true`) or non-green CI (`deliverable.ciStatus !==
    'green'`). `untrackedCount` and `unrelatedModifiedCount` are surfaced as `ignoredDrift` and never
    block (kills the 718-untracked false positive). Remaining steps are classified by REUSING
    `autonomy-classifier.classifySteps` (AC2), and the `message` states reversible-remaining (COMPLETE
    autonomously) vs carve-out-remaining (ESCALATE) — never a blanket "Admin incomplete."
  - `verifyGateDocs` / `scanGateDocs` — low-FP structured-marker advisory: validates only a present
    `Completion-Gate:` marker (`CG1` malformed value; `CG2` a `blocked` gate whose `Completion-Blocker:`
    names untracked/working-tree drift). Markerless docs ⇒ no finding.
  - CLI: `--evaluate <json>` prints the gate + G8 decision; bare run scans docs (advisory, exit 0).
- **`scripts/completion-gate.spec.js`** — 15 assertions, node-builtin, self-executing, exit 1 on fail.
- Wired into `governance-verify.verify()` as default-on, `COMPLETION_GATE_ADVISORY=0`-silenceable
  try/catch advisory; never contributes to `issues`; `completionGateAdvisories` result field + CLI
  print line added.
- `inventory/harness-self-test-registry.json` entry; `inventory/enforcement-telemetry-baseline.json`
  moved (24 validators, was 23 — a NEW validator must move the baseline).

## Evidence (local, pre-hermetic)

- `node scripts/completion-gate.spec.js` → 15 assertions passed.
- `node scripts/governance-verify.spec.js` → 7 assertions passed.
- `node scripts/enforcement-wiring-audit.js` → **24/24 validators enforced, 0 UNWIRED**.
- `node scripts/enforcement-telemetry.js` → 24/24 enforced (ratio 1), 0 unwired; baseline updated.
- `node scripts/governance-verify.js` → PASS; **0 completion-gate advisories** on the live corpus
  (zero false positives — present-marker-only).

## Gate coverage (Manager G-A…G-C)

- G-A: 718 untracked + clean deliverable + green CI ⇒ `complete`; dirty deliverable / red CI ⇒
  `blocked` with named blocker. ✓
- G-B: reversible-only remaining ⇒ "reversible-remaining / COMPLETE autonomously"; protected-merge /
  security-weakening remaining ⇒ "carve-out-remaining / ESCALATE" (AC2 reuse). ✓
- G-C: `CG1`/`CG2` fire on malformed / untracked-cited markers; markerless ⇒ 0; 0 live-corpus
  findings. ✓

→ Admin: run the hermetic clean-tree archive proof, cross-family consensus, PR, CI-green,
squash-merge (Autonomy-Decision: reversible).
