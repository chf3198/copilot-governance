---
title: Model Routing
type: concepts
created: 2026-04-14
status: draft
tags: []
---
# Model Routing — AUTO Selection & Fleet Distribution

**Type**: concept | **Created**: 2026-04-14 | **Epic**: #85+

## Summary

Model routing determines which LLM processes a given prompt.
VS Code Copilot uses AUTO selection for cloud models; OpenClaw
uses LiteLLM routing rules for local fleet models.

Fleet device selection is now capability-tag driven from
`inventory/devices.json` (`routing.inferenceClass`, `priority`,
`preferredFor`) before final model dispatch.
Current top node is [[36gbwinresource]].

## AUTO Model Selection (Copilot Cloud)

When set to AUTO (default), VS Code evaluates:
- **Task complexity** — simple edits → fast model; deep reasoning → premium
- **Token budget** — large codebase context → high-context model
- **Availability** — fallback if primary model is rate-limited

### Copilot Pro Models (Current Fleet)

| Model | Provider | Context | Multiplier | Strength |
|---|---|---|---|---|
| Claude Opus 4.6 | Anthropic | 200K | 3x | Deep reasoning |
| Claude Sonnet 4.6 | Anthropic | 200K | 1x | Balanced coding |
| Claude Haiku 4.5 | Anthropic | 200K | 0.33x | Fast tasks |
| GPT-4.1 | OpenAI | 1M | 0x | General purpose |
| GPT-5.2 | OpenAI | 128K | 1x | Deep reasoning |
| GPT-5 mini | OpenAI | 128K | 0x | Fast default |
| Gemini 2.5 Pro | Google | 1M | 1x | Long context |
| Gemini 3 Flash | Google | 1M | 0.33x | Fast coding |
| Grok Code Fast 1 | xAI | 128K | 0.25x | Code generation |

## OpenClaw Local Routing

OpenClaw (LiteLLM) and direct Ollama fallback distribute by capability:

| Model | Device | Context | RAM Needed | Use Case |
|---|---|---|---|---|
| qwen2.5:7b-instruct | 36gbwinresource | 128K | ~4.7GB | Primary local coding |
| qwen2.5-coder:7b | 36gbwinresource | 128K | ~5.0GB | Heavy codegen/refactor |
| qwen2.5:7b | windows-laptop | 128K | ~4.7GB | Secondary coding fallback |
| mistral:latest | windows-laptop | 32K | ~4.1GB | General tasks |
| phi3:mini | windows-laptop | 4K | ~2.3GB | Fast inference |
| qwen3.5:0.8b | penguin-1 | 32K | ~0.5GB | Tiny tasks |
| gemma3:270m | penguin-1 | 8K | ~0.3GB | Minimal inference |

## Fleet Target Order

1. `36gbwinresource` (`performance`, `heavy-coding`, priority 100)
2. `windows-laptop` (`standard`, `coding`, priority 40)
3. `penguin-1` (`micro`, `tiny`, priority 10)

## See Also

- [context-flow](context-flow.md) — full prompt chain
- [openclaw](../entities/openclaw.md)
- [copilot-pro](../entities/copilot-pro.md)
- [[fleet-capability-tagging-patterns-2026-04-28]]
