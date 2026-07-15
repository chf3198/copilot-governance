---
name: Provider-Neutral Governance
description: Shared governance contract for Codex, Copilot, Claude Code, and future agent runtimes.
applyTo: "**"
---

# Provider-Neutral Governance

## Shared Contract

Governance rules bind the work, not the vendor runtime. Every orchestrating
surface follows the same issue baton, lease, signing, branch, PR, test, closeout,
and cleanup rules before any runtime-specific adapter behavior applies.

- Treat the GitHub issue as the baton and keep one active role per ticket.
- Use one branch, one ticket, and one active PR for delivery work.
- Create or refresh a cross-team lease before editing shared files.
- Run the conflict gate before edits when paths overlap active work.
- Keep launcher/sandbox branches as entry points only, never delivery branches.
- Sign governed comments, PRs, docs, and commits with `Team&Model`.
- Prefer HAMR/fleet/free routing for governed provider calls before paid paths.
- Preserve dirty or unpushed work with rescue branches or draft PRs before cleanup.
- Close tickets only after merge, lease closeout, Consultant critique, and AC
  reconciliation.

## Adapter Boundaries

Runtime-specific wording belongs in adapter sections only. Shared governance
must say "agent runtime" or "orchestrating team" unless it is naming an adapter.

### Codex Adapter

- Codex project assets live under `.codex/` and repo-root `AGENTS.md`.
- Use official OpenAI/Codex docs when Codex behavior is uncertain.
- Do not infer Codex compatibility from Claude Code or Copilot behavior.

### Copilot Adapter

- Copilot project context lives in `.github/copilot-instructions.md`.
- Copilot runtime deployment targets include `~/.copilot/` via repo-mediated
  deploy commands only.
- Copilot-specific skills or agents stay in adapter-owned files.

### Claude Code Adapter

- Claude Code launcher worktrees use `sandbox/claude-code` or governed
  ticket-linked branches.
- Claude-specific IDE proxy, vision, and MCP low-resource guidance stays in
  adapter-owned instruction or skill files.
- Anthropic-specific provider assumptions must not be promoted into shared
  governance language.

### Cursor Adapter

- Cursor project context lives in `.cursor/rules/megingjord.mdc` (the `.mdc` rules format,
  `alwaysApply: true`); runtime home is `~/.cursor/` via `npm run deploy:cursor`.
- Cursor MCP servers register in `~/.cursor/mcp.json` (the `mcpServers` key).
- Runtime / HAMR / signing team value is `cursor`; the GitHub assignee slug is `cursor-team`.
- Phase 0 (#3084) is the static adapter + registration; Cursor-native hooks
  (`.cursor/hooks.json`, camelCase events) and HAMR substrate are Phase 1 (#3085) adapter-owned work.

## Compatibility Checklist

- Shared sections name all three adapters or none of them.
- Adapter sections may name one runtime and its setup files.
- Runtime homes (`~/.codex/`, `~/.copilot/`, `~/.agents/skills/`) are deploy
  targets, not direct edit targets.
- Tests must fail if Codex is omitted from shared coordination coverage.

## Cross-Team Comment Artifacts

Use these machine-readable GitHub comment blocks for coordination:
`CLAIM_LEASE`, `CONFLICT_PULL`, `TEAM_QUESTION`, `TEAM_RESPONSE`, and
`LEASE_CLOSE`.

- Validate artifacts with `scripts/global/cross-team-comment-artifacts.js`.
- Manager adjudicates `CONFLICT_PULL` when the owning team does not respond
  before the requested deadline.
- Manager escalates unanswered `TEAM_QUESTION` comments after `reply_by`.
- `CLAIM_LEASE` duplicates by ticket or branch are invalid.

Signed-by: Quill Harper
Team&Model: codex:gpt-5.4@openai
Role: collaborator
