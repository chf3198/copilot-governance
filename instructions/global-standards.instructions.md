---
name: Global Engineering Standards
description: Always-on standards for root-cause fixes, evidence-based claims, secret hygiene, and automation-first execution.
applyTo: "**"
---
# Global Engineering Standards

- Prefer root-cause fixes over detection-only band-aids.
- Prefer prevention over reaction: local guardrails first, CI backstops second.
- Never claim build, test, release, or publish success without explicit evidence.
- Keep changes minimal, localized, and reversible.
- Preserve public APIs unless change scope explicitly requires API updates.
- Never expose secrets in repository files, packaged artifacts, logs, or generated examples.
- Before packaging/publishing, verify exclude rules (`.vscodeignore`, `.npmignore`, artifact manifests) block secret-bearing files. Run manifest listing commands (`vsce ls`, `npm pack --dry-run`) as preflight.
- Use placeholders in docs and examples — never live tokens, keys, or credentials.
- Prevention first, detection second: local guardrails (exclude rules, pre-commit hooks) before CI scanning backstops.
- For versioned artifacts, enforce a single source of truth and verify version consistency (tag = manifest = changelog) before release.
- Use deterministic checks and objective pass/fail gates whenever possible.
- If evidence is incomplete, state uncertainty and gather missing evidence before finalizing.
