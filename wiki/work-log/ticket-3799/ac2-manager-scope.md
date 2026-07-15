# Manager Scope — #3799-AC2 (reversible-vs-carveout autonomy classifier)

- **Role:** Manager
- **Ticket:** #3799, acceptance criterion **AC2** (parent stays OPEN; AC1/AC3 already shipped)
- **Claim:** claim/3799-ac2
- **Branch/worktree:** feat/3799-ac2-reversible-classifier / ~/wt-3799ac2
- **Base:** origin/main @ 449ce46
- **Accountable team:** claude-code
- **Lane:** code-change | research-first taxonomy → tdd classifier

## AC2 (verbatim intent)

A predicate/guardrail that classifies remaining Admin steps as **reversible**
(feature-branch push + PR on unprotected/mirror repos) vs the retained
**irreversible carve-out** (merge to a *protected* main / production /
security-weakening), so autonomy completes the reversible steps by default and
only escalates the true carve-out. Log the autonomy-vs-escalate decision (G8).

## Taxonomy (the classifier core)

`classifyStep(step)` — pure. `step = { action, target, protectedTarget,
production, securityWeakening, irreversible }`.

| condition | classification | escalate |
| --- | --- | --- |
| `securityWeakening` | carve-out | yes (C-G4) |
| merge to `protectedTarget` or `production` | carve-out | yes |
| explicitly `irreversible` (tag/publish/delete-history) | carve-out | yes |
| push to a feature branch | reversible | no |
| open/update a PR | reversible | no |
| merge to an **unprotected**/mirror main | reversible | no |
| unknown/underspecified | carve-out (fail-safe) | yes |

Default-deny bias: anything not provably reversible is treated as a carve-out
(never weaken a genuine carve-out — the AC's explicit non-goal).

## Scope (this AC ONLY)

1. `scripts/autonomy-classifier.js` — pure `classifyStep` + `classifySteps`
   (summarize a remaining-step set → `{ reversible[], carveOuts[],
   escalateRequired }`) + `parseAutonomyDecision(text)` (read a logged
   `Autonomy-Decision:` marker) + `verifyAdminDocs(docs)` advisory.
2. Advisory (low false-positive by construction): it validates the decisions
   that ARE logged, and does **not** penalize docs that log none —
   - `AUT1_malformed_autonomy_decision`: an `Autonomy-Decision:` marker whose
     value is not `reversible` | `carve-out`.
   - `AUT2_carveout_auto_merged`: a doc whose decision is `carve-out` yet also
     records an autonomous/completed merge (contradiction — a carve-out must
     escalate, not self-merge).
   No marker present ⇒ no finding (adoption is rewarded, silence is not punished).
3. CLI: `--step '<json>'` classifies one step (prints classification + G8 line);
   with no args it scans `wiki/work-log/**` admin/handoff docs and prints AUT
   advisories. Always exit 0 (advisory-first).
4. Wire into `governance-verify.verify()` as a default-on, env-silenceable,
   try/catch advisory that never contributes to `issues` (copy the
   mirror-admin-completion / accountable-team idiom).
5. Sibling `scripts/autonomy-classifier.spec.js` (Node built-ins; exhaustive
   truth table + AUT1/AUT2 + robustness) and a `harness-self-test-registry.json`
   entry. Keep surface 0-unwired; refresh telemetry baseline.

## Out of scope

- AC4 (completion-gate hardening) — separate follow-on AC; AC2 only supplies the
  taxonomy AC4 will message with.
- Detecting live branch-protection over the network (headless-fragile); the
  classifier takes protection state as an explicit input / repo fact.
- Weakening any of the four genuine carve-outs or C-G1/C-G4.

## Acceptance criteria (this deliverable)

- **AC2.1** truth table above implemented + exhaustively spec'd; unknown⇒carve-out.
- **AC2.2** advisory validates logged decisions only (AUT1/AUT2), zero findings on
  the current baton corpus (no FP storm).
- **AC2.3** CLI exits 0; wired into governance-verify as non-blocking advisory.
- **AC2.4** sibling spec + registry entry; enforcement surface 0-unwired.
- **AC2.5** hermetic clean-tree spec run green; cross-family ≥2-family PASS (AC5 receipt).

## Baton plan

Manager (this) → Collaborator (impl+spec+registry+wire) → Admin (hermetic CI,
PR, squash-merge to unprotected main = reversible ⇒ autonomous, G8 logged) →
Consultant (independent closeout + cross-family receipt). Parent #3799 stays OPEN
(AC4 remains).
