---
name: Team&Model Identity in Workflows
description: Canonical patterns for storing, parsing, and comparing Team&Model identity in GitHub Actions workflows.
applyTo: ".github/workflows/**,scripts/global/**,instructions/**"
---

# Team&Model Identity in Workflows

Use Team&Model as the primary identity key for governed automation. GitHub login is fallback only when Team&Model is unavailable.

## Canonical identity format

- Field name: `Team&Model`
- Value format: `team:model@substrate`
- Examples:
  - `copilot:gpt-5.4-mini@local`
  - `claude-code:opus-4-7@anthropic`
  - `codex:gpt-5.4@codex-cli`

## Where to store identity

1. PR body (preferred):
   - `Team&Model: copilot:gpt-5.4-mini@local`
2. Commit trailer (fallback source):
   - `Team&Model: copilot:gpt-5.4-mini@local`
3. Legacy alias accepted for parser compatibility:
   - `AI-Team-Model: ...`

## Comparison order (required)

When comparing actors in workflows:
1. Parse Team&Model from PR body
2. If missing, parse Team&Model from commit trailers
3. If still missing, fallback to GitHub login
4. Compare resolved identity values

Never prefer login over Team&Model when Team&Model exists.

## Parser pattern (regex)

Use a case-insensitive multiline regex:
- `/^(?:Team&Model|AI-Team-Model):\s*(.+)$/im`

Parser behavior:
- Return first non-empty capture
- Trim whitespace
- Return `null` when not found

## Workflow authoring guidance

- Keep identity resolution in a pure helper under `scripts/global/`
- Reuse the helper from workflows and tests
- Add unit tests for:
  - same login + different Team&Model => treated as different actors
  - same Team&Model => treated as same actor
  - PR-body and commit-trailer extraction

## Governance expectations

- Include Team&Model on baton artifacts and governed PRs
- Keep identity checks deterministic and auditable
- Document any login fallback use in the workflow comment/evidence

## Verification checklist

- [ ] Team&Model field present in PR body template or workflow docs
- [ ] Helper resolves Team&Model before login
- [ ] Unit tests cover Team&Model-first behavior
- [ ] Workflow behavior matches cross-team coordination protocol (#1305)
