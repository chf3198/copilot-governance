# Manager scope — #3802 (E1): enforcement-wiring-audit — detect "reconciled-to-done but never enforced" validators

> **Baton role**: MANAGER | **ticket**: #3802 (wiki-mirror; no live GitHub issue — issue space maxes at #5)
> **Epic lineage**: E1 self-anneal — "burning down reconciled-to-done guardrails that never enforced"
> (Drift-Remediation Roadmap §4.iii). Complements #1893 validator-discipline, does not overlap it.
> **Lane**: lane:code-change | **Priority**: P2 | **test_strategy**: tdd (validator + sibling spec + clean-tree archive regression)

## Problem / provenance

`scripts/validator-discipline.js` (#1893) enforces that any new/modified validator ships a **sibling
spec + self-test registry entry**. It does NOT check whether a validator is ever actually **invoked**
by an enforced path. A validator can therefore satisfy validator-discipline and still be dead code —
present in the tree, "reconciled to done," but wired into no CI workflow, git hook, or self-test
regression. That is exactly the §4.iii failure class: *guardrails reconciled-to-done that never enforced.*

**Observed baseline (origin/main @ b2fe570):** of 18 non-spec validators under `scripts/`, the CI
workflows invoke only `validator-discipline.js` (plus the `baton-e2e.spec.js` fixture); the
`harness-self-test-registry.json` lists 4 (`validator-discipline`, `epic-child-baton-traceability`,
`accountable-team`, `signer-alias`). `governance-verify.js` and its whole `require()` subtree
(`accountable-team-verify`) are reachable from **no** enforced root. These are real unwired guardrails.

## Acceptance criteria

- [ ] **AC1 (audit validator).** New `scripts/enforcement-wiring-audit.js`: inventory every non-spec
      `scripts/*.js` validator and classify each as ENFORCED or UNWIRED. "ENFORCED" = reachable from at
      least one *enforced root* — a `.github/workflows/*.yml` job, a `.github/scripts/*.sh` / `.githooks/*`
      hook script, or an `inventory/harness-self-test-registry.json` entry — either by direct
      `scripts/<name>.js`/`.spec.js` reference or by transitive `require('./…')` closure from a referenced
      script. UNWIRED = reachable from none. Report per-validator wiring status + reason; `--json` mode.
- [ ] **AC2 (advisory-first, non-bypassable presence).** Ships a sibling `scripts/enforcement-wiring-audit.spec.js`
      (Node built-in `assert`, self-executing, exit 1 on regression) and a `harness-self-test-registry.json`
      entry, so it is itself covered by the #1893 discipline gate and runs green in CI. The audit CLI is
      **advisory-first** (exit 0, prints the UNWIRED burndown list) — promote to hard-block only after a
      low-FP soak (harness norm, §3g).
- [ ] **AC3 (hermetic).** Runs from a clean, `.git`-less archive checkout using Node built-ins only (no
      `gh`, no network, no untracked deps). `git archive <branch> | tar -x -C /tmp/ci && node
      scripts/enforcement-wiring-audit.spec.js` is GREEN.
- [ ] **AC4 (wired burndown surface).** The audit runs in CI as a **non-blocking advisory** job (its own
      workflow step or folded into an existing PR workflow) so the unwired-validator burndown count is
      visible on every PR without blocking merge.
- [ ] **AC5 (consensus).** The audit's "enforced-root reachability" taxonomy ratified by a free
      ≥2-distinct-family `cross-family-consensus.js` panel (kind=review, consensus PASS); receipt cited.

## Non-goals / guardrails

- **Not** auto-wiring or deleting the unwired validators (that is downstream burndown work per finding).
- **Not** re-implementing validator-discipline's spec/registry-presence check (disjoint surface).
- Advisory-first: the audit CLI exits 0; it never blocks a PR in this ticket.
- Touch ONLY #3802 files: `scripts/enforcement-wiring-audit.js(+.spec.js)`,
  `inventory/harness-self-test-registry.json`, one CI workflow, `wiki/work-log/ticket-3802/*`,
  `wiki/work-log/tickets/3802.md`. Never stage canonical-checkout foreign drift.

## Verification gates (Collaborator must produce)

1. `node scripts/enforcement-wiring-audit.spec.js` → exit 0 (regression green).
2. Clean-tree archive hermetic run → exit 0.
3. `node scripts/enforcement-wiring-audit.js --json` → deterministic classification incl. the known
   UNWIRED set (e.g. `governance-verify`, `accountable-team-verify`) and ENFORCED set
   (`validator-discipline` via workflow; `signer-alias` via registry + transitive require).
4. cross-family PASS receipt recorded in the consultant closeout.
