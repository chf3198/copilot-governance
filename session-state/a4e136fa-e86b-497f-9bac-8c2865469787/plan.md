Problem: Copilot skill loading is failing because multiple `skills/*/SKILL.md` manifests have invalid YAML frontmatter or are missing required skill metadata, and the broken manifests have already propagated into the deployed `~/.copilot/skills` runtime.

Approach:
- Repair the source-of-truth skill manifests in this repo so every `SKILL.md` has valid frontmatter and the required Copilot skill keys.
- Re-run strict manifest validation plus existing repo checks, then deploy the fixed skill files into the Copilot runtime.

Notes:
- The dominant parser failure is unquoted `argument-hint` values containing `: `, with a smaller set of skills missing `argument-hint`, `user-invocable`, and `disable-model-invocation`.
- `skills/llm-wiki-ops/SKILL.md` is missing frontmatter entirely and needs a complete metadata block.
