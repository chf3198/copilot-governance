---
title: "Provider Adapter Matrix 2026-05-14"
type: source
created: 2026-05-14
updated: 2026-05-14
tags: [providers, routing, codex, hamr]
sources: ["/home/curtisfranks/devenv-ops/research/provider-adapter-matrix-2026-05-14.md"]
related: ["[[codex-compatibility-audit-2026-05-13]]", "[[token-provider-adapters]]"]
status: active
confidence: high
last_verified: 2026-05-14
---

# Provider Adapter Matrix 2026-05-14

## Summary

Ticket #1485 maps runtime capabilities separately from provider capabilities so
the harness can support Codex, Copilot, Claude Code, OpenClaw, fleet, and
provider paths without hard-coding one vendor's assumptions.

## Details

Runtime surfaces own interaction mechanics: instructions, MCP/tool access,
hooks, subagents, sandboxing, approvals, and worktree behavior. Provider
surfaces own model IDs, wire APIs, usage fields, caching, budgets, rate limits,
and quota behavior.

Key conclusions:

- Codex has first-class config, MCP, hooks, skills, subagents, sandbox,
  approvals, and OpenTelemetry controls.
- Claude Code remains richest in hook/plugin/subagent patterns, but should be
  treated as one runtime adapter rather than the shared policy baseline.
- Copilot coding agent supports MCP tools, custom instructions, custom agents,
  hooks, and a sandboxed cloud environment, but MCP resources/prompts are not a
  portable assumption.
- HAMR should expose capability lanes and telemetry confidence, while provider
  adapters handle OpenAI-compatible, Anthropic, Ollama, OpenRouter, LiteLLM,
  and fleet-specific details.

## Related

- [[codex-compatibility-audit-2026-05-13]]
- [[token-provider-adapters]]
- [[model-routing]]
- [[harness-goals]]

## Sources

- Research artifact:
  `research/provider-adapter-matrix-2026-05-14.md`
- OpenAI Codex docs: <https://developers.openai.com/codex/config-reference>
- Claude Code hooks: <https://docs.anthropic.com/en/docs/claude-code/hooks>
- GitHub Copilot MCP:
  <https://docs.github.com/en/copilot/concepts/coding-agent/mcp-and-coding-agent>
- Anthropic Messages: <https://docs.anthropic.com/en/api/messages-examples>
- LiteLLM: <https://docs.litellm.ai/>
- OpenRouter limits:
  <https://openrouter.ai/docs/api-reference/api-reference/limits>
- Ollama OpenAI compatibility: <https://docs.ollama.com/openai>

Signed-by: Quill Harper  
Team&Model: codex:gpt-5.4@local  
Role: collaborator
