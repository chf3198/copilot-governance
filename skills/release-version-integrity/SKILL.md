---
name: release-version-integrity
description: Validate and enforce release version integrity across tags, manifests, changelogs, and publish workflows. Use before tagging, publishing, or when release metadata drift is suspected.
---

# Release Version Integrity

## When to use

- Before any release or publish action.
- When `package.json`/manifest version, git tag, and changelog may be inconsistent.
- After cherry-picks or hotfixes that bypassed normal release flow.

## Procedure

1. Detect release source-of-truth files (manifest + changelog + workflow triggers).
2. Compare tag version, manifest version, and changelog head version.
3. Check publish workflow for explicit version/tag validation gates.
4. Confirm artifact preflight exists (`vsce ls`/equivalent package manifest audit).
5. Propose the smallest change that makes drift structurally unlikely.

## Output format

- `integrity_status`: pass|fail
- `drift_points`: exact mismatches found
- `required_gates`: missing required checks
- `minimal_fix_plan`: ordered steps to remediate
- `evidence`: files and checks reviewed

## Standards

- Do not claim release readiness without explicit evidence.
- Prefer automated versioning flows over manual multi-file updates.
- Keep release metadata factual and traceable.
