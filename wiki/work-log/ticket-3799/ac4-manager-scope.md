---
title: "#3799 AC4 — completion-gate hardening: MANAGER scope"
type: baton-manager
ticket: 3799
ac: 4
role: manager
lane: code-change
created: "2026-07-15"
accountable-team: claude-code
---
# #3799 AC4 — completion-gate hardening (MANAGER scope)

Branch: `feat/3799-ac4-completion-gate` · Claim: `claim/3799-ac4` · Base: `origin/main@1ad9256`

## Problem (from the AC4 acceptance criterion)

> AC4 (completion gate hardening): the stop/completion gate for `lane:code-change` checks the
> **branch's committed deliverable is clean + CI-green**, not the unrelated working-tree drift
> (the 718-untracked false-positive that fires once `collaborator=true`), and emits a clear
> "reversible-remaining vs carve-out-remaining" message instead of a blanket "Admin incomplete."

The stop/completion signal today conflates two orthogonal things:
1. Is the **deliverable** done? (the tracked change on the branch is committed-clean and CI is green)
2. Is the **working tree** pristine? (no untracked / no unrelated-modified files)

(2) is the wrong question for completion: the canonical checkout carries a permanent live-harness
baseline of hundreds of untracked files (see [[3026-drift-is-live-harness-baseline-not-3026]] /
[[ticket-3801-baseline-capture-merged]]). Once `collaborator=true`, the blanket check fires on that
drift and reports "Admin incomplete," normalizing premature stops — the exact friction #3799 was
filed to anneal.

## Scope (IN)

Ship `scripts/completion-gate.js`, a pure + advisory validator:

- **`evaluateCompletion(ctx)`** — the corrected gate predicate. Blockers are ONLY
  `deliverable.committedClean === false` (the tracked deliverable itself has uncommitted changes) or
  `deliverable.ciStatus !== 'green'`. Untracked count and unrelated-modified count are surfaced as
  *ignoredDrift* and NEVER block. Remaining Admin steps are classified by REUSING the AC2 taxonomy
  (`autonomy-classifier.classifySteps`) into reversible-remaining vs carve-out-remaining, and the
  returned `message` says which — never a blanket "Admin incomplete."
- **`verifyGateDocs(docs)` / `scanGateDocs(root)`** — a low-false-positive structured-marker advisory
  in the AC2 mold. It validates ONLY an explicit `Completion-Gate:` marker that a baton doc chooses to
  log (present-marker-only; docs without it yield no finding):
  - `CG1_malformed_completion_gate` — marker value not in {complete, blocked, reversible-remaining,
    carve-out-remaining}.
  - `CG2_untracked_cited_as_blocker` — `Completion-Gate: blocked` while a `Completion-Blocker:` marker
    names untracked / working-tree drift (the annealed false positive): untracked drift is never a
    valid completion blocker when the committed deliverable is clean + CI-green.
- Wire it into `governance-verify.verify()` as a default-on, `COMPLETION_GATE_ADVISORY=0`-silenceable
  try/catch advisory that NEVER contributes to `issues` (copy the AC2 / mirror-admin block, incl. a
  `completionGateAdvisories` result field + CLI print line).
- Sibling `scripts/completion-gate.spec.js` (node-builtin assert, self-executing, exit 1 on fail) +
  `inventory/harness-self-test-registry.json` entry. New validator ⇒ must stay ENFORCED (0-unwired via
  `enforcement-wiring-audit.js`) and the enforcement telemetry baseline MUST move
  (`enforcement-telemetry.js --update-baseline`).

## Scope (OUT / non-goals)

- Modifying the external harness stop-hook itself (out-of-repo; IT/harness surface). AC4 ships the
  in-repo *validator* that models the correct gate contract; the harness hook text is not this ticket.
- Weakening any genuine carve-out (design/UAT/irreversible/security-weakening) or C-G1/C-G4.
- Keyword/prose scanning of baton docs (would self-flag docs discussing carve-outs) — structured
  present-markers only, targeting 0 findings on the current corpus.

## Acceptance gates (verification)

- G-A `evaluateCompletion`: 718 untracked + clean committed deliverable + CI green ⇒ gate `complete`
  (drift ignored); dirty committed deliverable OR non-green CI ⇒ gate `blocked` with named blocker.
- G-B remaining-step message: reversible-only remaining ⇒ "reversible-remaining / COMPLETE
  autonomously"; any carve-out remaining ⇒ "carve-out-remaining / ESCALATE" — reusing AC2 classifier.
- G-C advisory: `CG1`/`CG2` fire on malformed / untracked-cited markers; markerless docs ⇒ 0 findings;
  0 findings on the live corpus.
- G-D discipline: spec + registry entry present; `enforcement-wiring-audit` shows 0 unwired; telemetry
  baseline updated; hermetic clean-tree archive run of the new spec + `governance-verify.spec` green.
- G-E independent validation: cross-family ≥2-distinct-family PASS receipt cited.

## Baton plan

Manager (this) → Collaborator (build + specs + wiring) → Admin (hermetic proof, PR, CI-green,
squash-merge to unprotected main = reversible ⇒ autonomous per AC2) → Consultant (independent
critique + closeout). Autonomy-Decision: reversible.
