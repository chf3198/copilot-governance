---
name: docs-drift-maintenance
description: Detect and remediate documentation drift after code, config, workflow, or UX changes. Use after implementation, before merge, and before release.
---

# Docs Drift Maintenance

## When to use

- After any change to commands, config, workflows, API/CLI behavior, or release process.
- Before merge/release if docs accuracy is part of acceptance.

## Procedure

1. Enumerate changed behavior/config/workflow surfaces.
2. Map each change to impacted docs (`README`, `CHANGELOG`, operational docs, runbooks).
3. Identify stale, missing, or contradictory statements.
4. Apply minimal doc deltas that restore correctness and traceability.
5. Verify that docs now match actual behavior and invocation paths.

## Output format

- `drift_status`: none|found|critical
- `impacted_docs`: file list with reason
- `required_updates`: concrete edits required
- `verification_checks`: objective checks confirming alignment
- `evidence`: code/workflow changes correlated to docs updates

## Standards

- Docs updates must ship with behavior/config/workflow changes.
- Keep wording precise, testable, and user-actionable.
- Avoid speculative claims unsupported by current implementation.
