---
title: "Paid Token Floor Reduction Research 2026-05-01"
type: source
created: 2026-05-01
updated: 2026-05-01
tags: [token-economics, free-orchestrator, rag, cloudflare, ai-gateway, vllm-semantic-router, claude-context, mcp]
sources: [/home/curtisfranks/devenv-ops/research/paid-token-floor-reduction-2026-05-01.md]
related: ["[[fleet-architecture]]", "[[cascade-dispatch]]", "[[36gbwinresource]]", "[[openclaw]]", "[[penguin-1]]", "[[model-routing]]"]
status: draft
---

# Paid Token Floor Reduction Research 2026-05-01

## Summary

Research for epic #782 — drive paid Claude Code/Copilot consumption below 50% of current volume by offloading orchestration, repo-context loading, and per-turn state to free fleet + free cloud resources.

Key 2026-Q2 findings:
- vLLM Semantic Router (Athena v0.2) is the production pattern for free-model routing — classifier + signal stack, not LLM-as-router
- `zilliztech/claude-context` is a working MCP server pattern for repo-RAG via tool calls
- Anthropic's "Effective Context Engineering" formalizes "just-in-time context" — load via tool calls, not eager-stuff CLAUDE.md
- Cloudflare AI Gateway in front of Anthropic provides 30-60% cache hit rate at zero infrastructure cost
- Google AI Studio Gemini 2.0 Flash: 15 RPM / 1M tokens/day FREE, no card required
- GitHub Models offers free Claude 3.5 Sonnet API access (rate-limited)
- Multi-account stacking is forbidden by all major 2026 ToS

## Four moves, ranked by ROI

1. Move 0 — Cloudflare AI Gateway in front of Anthropic — 15-25% savings, zero risk
2. Move 2 — Repo-context RAG via penguin-1 + `claude-context` MCP — 15-25% savings
3. Move 3 — Per-turn state offload to Cloudflare Worker MCP — 5-10% savings
4. Move 1 — Free-model orchestrator (vLLM SR / RouteLLM) — 15-25% savings, highest complexity

Combined target: 50-75% reduction in paid token consumption.

## Cross-links

- See `wiki/sources/fleet-resource-audit-2026-05-01.md` for current fleet capacity
- See `wiki/sources/fleet-hardware-optimization-2026-05-01.md` for #734 model placement
- See [[cascade-dispatch]] for current routing semantics
- See [[fleet-architecture]] for system topology
