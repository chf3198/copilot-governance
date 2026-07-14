# Manager scope — #3803 (E1): make governance-verify enforceable on the flat layout + wire it

> **Baton role**: MANAGER | **ticket**: #3803 (wiki-mirror; no live GitHub issue) | **Priority**: P2
> **Epic lineage**: E1 §4.iii burndown. Directly closes the single UNWIRED finding surfaced by #3802's
> enforcement-wiring-audit: `governance-verify` is reachable from no enforced root.
> **Lane**: lane:code-change | **test_strategy**: tdd (add missing spec, fix false-failure, wire, hermetic regression)

## Problem (diagnosed)

`scripts/governance-verify.js` is the primary ticket/workflow governance validator but is **wired into
no enforced path** (#3802 finding), and it **cannot be wired as-is** — on the flat `main` layout it
exits 1 for a spurious reason:

- Lines 46–60 hard-require `.github/workflows/lint.yml` **and** `branch-name.yml` to exist and declare a
  `merge_group:` trigger. **Neither file has ever existed in this flat repo** (its workflows are
  `validate-pr.yml`, `validator-discipline.yml`, `global-governance-presence.yml`,
  `enforcement-wiring-audit.yml`). So the check emits two `missing workflow file` issues → exit 1,
  purely a false positive against legacy filenames from a different (nested) layout.
- Its ticket-lint loop reads `path.resolve(__dirname,'..','..')/tickets` (a nested-layout path); on flat
  `main` that directory is absent → 0 tickets linted (harmless no-op, but means the loop does nothing here).
- It ships **no sibling spec** and is absent from the self-test registry → untested; the #1893
  validator-discipline gate would (advisorily) flag any change to it.

Its advisory blocks (ownership #2345, epic-child-baton #3800) already resolve the flat mirror path via
`__dirname/../wiki/work-log/tickets` and work correctly — so the validator does have live value on flat
main once the false failure is removed.

## Acceptance criteria

- [ ] **AC1 (no false failure).** The merge-queue-readiness check no longer treats the legacy filenames
      `lint.yml`/`branch-name.yml` as mandatory. Make it **presence-tolerant**: only assert a
      `merge_group:` trigger for a workflow that *exists*; an absent legacy workflow is not an error
      (the repo may not use it). A `merge_group`-less **present** workflow is still flagged (intent
      preserved). `node scripts/governance-verify.js` on a clean flat checkout → **exit 0**.
- [ ] **AC2 (regression spec).** New `scripts/governance-verify.spec.js` (self-executing, Node built-in
      `assert`, exit 1 on regression). Hermetic fixture-tree coverage: (a) present workflow missing
      `merge_group` → flagged; (b) present workflow *with* `merge_group` → clean; (c) absent legacy
      workflow → NOT flagged; (d) a ticket with a missing/invalid Priority → flagged (proves ticket-lint
      still enforces where tickets exist). Advisory blocks must not throw when the mirror dir is absent.
- [ ] **AC3 (registry + discipline).** Add a `governance-verify` entry to
      `inventory/harness-self-test-registry.json` (satisfies #1893: modified validator ships spec + entry).
- [ ] **AC4 (wired).** Run `node scripts/governance-verify.spec.js` (hard) and
      `node scripts/governance-verify.js` (verify pass) in CI, so governance-verify becomes ENFORCED per
      the #3802 audit (its UNWIRED count drops to 0). May extend an existing workflow or add a dedicated one.
- [ ] **AC5 (hermetic).** `git archive <branch> | tar -x` into a `.git`-less tree; `node
      scripts/governance-verify.spec.js` **green** and `node scripts/governance-verify.js` **exit 0**
      (Node built-ins only; no network/`gh`/untracked deps).
- [ ] **AC6 (consensus).** The presence-tolerant semantics change to a core validator ratified by a free
      ≥2-distinct-family `cross-family-consensus.js` panel; receipt cited.
- [ ] **AC7 (close the loop).** After merge, `node scripts/enforcement-wiring-audit.js` reports
      **0 UNWIRED** (or governance-verify no longer in the unwired list).

## Non-goals

- **Not** reconciling governance-verify's `# Ticket N —` ticket parser to the flat wiki-mirror frontmatter
  schema (the mirror tickets use different fields). That is a separate, larger research-first ticket;
  here the ticket-lint loop stays a safe no-op on flat main and unchanged for the nested layout.
- **Not** weakening any real check: the merge_group assertion is preserved for workflows that exist; only
  the mandatory-existence of two legacy filenames (never present in this repo) is dropped.
- Advisory blocks (ownership/epic-child) unchanged.

## Files (touch ONLY these)

`scripts/governance-verify.js`, `scripts/governance-verify.spec.js`,
`inventory/harness-self-test-registry.json`, one CI workflow, `wiki/work-log/ticket-3803/*`,
`wiki/work-log/tickets/3803.md`.
