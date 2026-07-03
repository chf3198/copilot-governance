# Epic #1271 Codex FDPR

## Summary

Codex recommends a governance-first FDPR for Epic #1271. The plan keeps
Claude Code's `EPIC_RESCOPE` and Consultant-close ordering, Copilot's GitHub
2026 platform adapters, and Codex's AC truth-table contract.

## Details

The canonical source of truth should be a portable Epic-body AC schema plus
reconciler JSON. GitHub Issue Fields, hierarchy, semantic search, release
evidence, and issue dependency APIs should enrich reconciliation when available,
but they should not be the sole truth source in v1.

Implementation sequence:

1. Wave 1: `EPIC_RESCOPE` validator and Consultant-only Epic closeout.
2. Wave 2: AC reconciler, close-readiness v2, narrative lint, and GHS signals.
3. Wave 3: `status:measuring`, recheck cron, and all-issue dependency DAG.
4. Wave 4: advisory migration, wiki consolidation, and dashboard reporting.

Key caveats:

- Issue Fields are public preview and private-project scoped.
- Semantic/hybrid issue search has a 10 req/min budget.
- Dependency API writes require backoff-safe, low-volume design.
- AI may draft AC predicates, but operator-reviewed intent remains canonical.

## Related

- [[epic-state-truthfulness]]
- [[epic-ac-reconciliation]]
- [[epic-governance]]
- [[baton-protocol]]
- [[harness-goal-controls]]

## Sources

- `research/epic-1271-codex-fdpr-2026-05-10.md`
- https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-issue-fields
- https://github.blog/changelog/2026-04-02-improved-search-for-github-issues-is-now-generally-available/
- https://docs.github.com/en/rest/issues/issue-dependencies
- https://arxiv.org/abs/2603.15911
