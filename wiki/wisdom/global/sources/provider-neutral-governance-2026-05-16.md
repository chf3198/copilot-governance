# Provider-Neutral Governance

Source: `research/issue-1623-provider-neutral-governance-2026-05-16.md`.

The normalized governance contract separates shared rules from runtime adapters.
Shared rules bind every orchestrating team: issue baton, one branch/ticket/PR,
cross-team lease, conflict gate, Team&Model signing, HAMR/fleet/free routing,
preservation before cleanup, and Consultant closeout.

Runtime-specific details stay in adapter sections:

- Codex: `.codex/`, `AGENTS.md`, and official OpenAI/Codex docs for uncertainty.
- Copilot: `.github/copilot-instructions.md`, `~/.copilot/` deploy targets, and
  Copilot-specific skills or agents.
- Claude Code: `sandbox/claude-code`, IDE proxy, vision, and MCP low-resource
  guidance.

The compatibility invariant is simple: shared coordination coverage must include
Codex, Copilot, and Claude Code equally, while provider assumptions remain
adapter-local.

Signed-by: Quill Harper
Team&Model: codex:gpt-5.4@openai
Role: collaborator
