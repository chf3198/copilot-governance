---
name: Release and Docs Hygiene
description: Standards for release integrity, artifact safety, documentation synchronization, and post-merge governance. Includes mandatory post-merge checklist.
applyTo: "**"
---
# Release and Docs Hygiene

## Post-Merge / Post-Deploy Governance Checklist (Mandatory)

After every PR merge or deployment that changes user-facing behavior, run these governance steps before considering the task complete:

1. **CHANGELOG fragment**: For every shipped behavioral change, create a per-ticket fragment at `.changes/unreleased/<N>.md` (where `N` is the GitHub issue number). Aggregator (`node scripts/global/changelog-aggregate.js`) prepends fragments into `CHANGELOG.md` at release time. Direct edits to `CHANGELOG.md` remain valid (back-compat) but the fragment path is preferred — it eliminates merge conflicts when multiple PRs ship in parallel. For trivial PRs warranting no changelog entry, include `[skip-changelog]` in the PR description. Extension changelog (`vscode-extension/CHANGELOG.md`) covers both extension and daemon changes. See `docs/howto/changelog-fragments.md` for the author guide.
2. **README sync**: If the change adds, removes, or modifies user-visible behavior (kill hierarchy, commands, settings, protection rules), update both `README.md` and `vscode-extension/README.md`.
3. **Profile governance**: Run the `repo-profile-governance` skill to audit community health files (SUPPORT.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md), metadata (description, topics, homepage), and contribution surfaces (templates, CODEOWNERS).
4. **Docs drift**: Run the `docs-drift-maintenance` skill to detect stale documentation that contradicts the new behavior.
5. **Learnings**: If the change revealed a significant discovery, add an entry to `docs/workflow/learnings.md`.
6. **Release integrity**: If the merge changes extension or package behavior, run `release-version-integrity` to validate tag/manifest/changelog alignment, then publish the new version.
7. **Artifact attestation**: Tag-triggered releases MUST produce both cosign-bundle signature AND GitHub Artifact Attestation (Sigstore-backed; via `actions/attest-build-provenance`). C13 (#999) enables the parallel attestation signal alongside the existing cosign path.

Do not consider a PR merge or deployment task complete until steps 1-7 are explicitly addressed (either completed or confirmed not applicable).

## Tech-Writer sub-phase (lane:code-change)

`COLLABORATOR_HANDOFF` for `lane:code-change` tickets MUST include a `doc-coverage:` block
declaring each required surface as `UPDATED: <path>` or `N/A: <surface> — <reason>`.
Required surfaces per `area:*` label are defined in `config/doc-coverage-matrix.yml`.
Validator: `scripts/global/megalint/doc-coverage.js`. Escape hatch: `DOC_COVERAGE_GATE_ADVISORY=1`.

## Merge-time documentation governance

For the operator-facing runbook describing how Epic #2148 children (C0+C1+C2+C3+C5+C7) compose into the four-surface merge-time documentation governance system, see [docs/howto/merge-time-doc-governance.md](../docs/howto/merge-time-doc-governance.md).
