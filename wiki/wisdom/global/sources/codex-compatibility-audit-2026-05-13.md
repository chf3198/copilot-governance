# Codex Compatibility Audit

## Summary

Ticket #1476 audits the Megingjord harness for OpenAI Codex compatibility after
Claude Code and Copilot did the bulk of recent implementation work. The audit
finds that Codex support is real and already substantial, but shared routing and
activation surfaces can still drift toward Anthropic defaults.

## Key Findings

- Codex is already represented in runtime assets, hooks, skills, wiki deployment,
  Team&Model signing, worktree rules, and OpenAI Developer Docs MCP wiring.
- The highest-risk surfaces are routing defaults, HAMR activation defaults, and
  cost/telemetry prose that visibly names Claude or Anthropic where the harness
  should use capability-tier language.
- OpenAI Codex docs confirm that AGENTS.md, config.toml, MCP, hooks, skills,
  subagents, GitHub integration, cloud tasks, and OpenTelemetry are native Codex
  surfaces, not compatibility afterthoughts.

## Recommended Next Work

1. Create a provider-neutral routing policy ticket.
2. Harden Codex AGENTS.md and config guidance for governance review.
3. Fix HAMR activation parity for linked worktrees and non-Anthropic providers.
4. Add OpenAI/Codex telemetry ingestion guidance.
5. Maintain a provider adapter matrix for all supported runtimes.

## Related

- Research artifact: `research/codex-compatibility-audit-2026-05-13.md`
- GitHub issue: #1476
- Prior Codex plan: [[epic-1271-codex-fdpr-2026-05-10]]
- Harness goals: [[harness-goals]]
- Routing pattern: [[cascade-dispatch]]

## Sources

- OpenAI Codex quickstart: <https://developers.openai.com/codex/quickstart>
- OpenAI Codex config reference:
  <https://developers.openai.com/codex/config-reference#configtoml>
- OpenAI Codex GitHub integration:
  <https://developers.openai.com/codex/integrations/github#customize-what-codex-reviews>
- OpenAI Codex migration guide: <https://developers.openai.com/codex/migrate>

Signed-by: Quill Harper  
Team&Model: codex:gpt-5.4@codex-cli  
Role: collaborator
