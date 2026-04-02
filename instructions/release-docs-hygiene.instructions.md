---
name: Release and Docs Hygiene
description: Standards for release integrity, artifact safety, documentation synchronization, and post-merge governance. Includes mandatory post-merge checklist.
applyTo: "**"
---
# Release and Docs Hygiene

- Before any release action, verify version consistency between tag, manifest, and changelog. Invoke `release-version-integrity` skill for systematic drift detection.
- Audit packaged artifact file lists before publish when packaging tools support manifest listing.
- Treat `.env`, key material, token files, and private config as non-distributable by default. Invoke `secret-exposure-prevention` skill when editing publish/package workflows.
- If commands, configuration, workflows, or user-facing behavior change, update README/CHANGELOG and operation docs. Invoke `docs-drift-maintenance` skill to systematically detect stale documentation.
- Prefer automated versioning flows over manual multi-file version edits.
- Keep release notes factual and traceable to merged changes.

## Post-Merge / Post-Deploy Governance Checklist (Mandatory)

After every PR merge or deployment that changes user-facing behavior, run these governance steps before considering the task complete:

1. **CHANGELOG**: Add an entry for every shipped behavioral change. Extension changelog (`vscode-extension/CHANGELOG.md`) covers both extension and daemon changes.
2. **README sync**: If the change adds, removes, or modifies user-visible behavior (kill hierarchy, commands, settings, protection rules), update both `README.md` and `vscode-extension/README.md`.
3. **Profile governance**: Run the `repo-profile-governance` skill to audit community health files (SUPPORT.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md), metadata (description, topics, homepage), and contribution surfaces (templates, CODEOWNERS).
4. **Docs drift**: Run the `docs-drift-maintenance` skill to detect stale documentation that contradicts the new behavior.
5. **Learnings**: If the change revealed a significant discovery, add an entry to `docs/workflow/learnings.md`.
6. **Release integrity**: If the merge changes extension or package behavior, run `release-version-integrity` to validate tag/manifest/changelog alignment, then publish the new version.

Do not consider a PR merge or deployment task complete until steps 1-6 are explicitly addressed (either completed or confirmed not applicable).
