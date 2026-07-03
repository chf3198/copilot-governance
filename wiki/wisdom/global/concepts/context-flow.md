---
title: Context Flow
type: concepts
created: 2026-04-14
status: draft
tags: []
---
# Context Flow — How LLM Context Moves Through the Fleet

**Type**: concept | **Created**: 2026-04-14 | **Epic**: #85+

## Summary

Context flow describes how a user prompt in VS Code Copilot Chat
becomes a structured API request, is routed to an LLM, and returns
a response — traversing cloud and local infrastructure.

## The Full Chain

```
User Prompt (VS Code)
    ↓
Copilot Extension Host
  ├─ Gathers: open files, selections, instructions, skills, #refs
  ├─ Applies: custom instructions (.github/copilot-instructions.md)
  ├─ Attaches: MCP tool definitions, conversation history
  └─ Assembles prompt envelope (~system + user + context)
    ↓
AUTO Model Selection (or manual pick)
  ├─ Evaluates: task complexity, token budget, model strengths
  └─ Selects: e.g. Claude Opus 4.6 for deep reasoning
    ↓
GitHub Copilot API (cloud)
  ├─ Applies: content filters, public code matching
  ├─ Routes to: selected LLM provider (Anthropic, OpenAI, Google)
  └─ Returns: streamed response to VS Code
    ↓
VS Code renders response + applies edits
```

## OpenClaw Parallel Path

When tasks are routed to OpenClaw (self-hosted LiteLLM):

```
Agent detects: fleet-routable task
    ↓
OpenClaw Proxy (windows-laptop:4000)
  ├─ Receives: API-compatible request
  ├─ Routes to: local Ollama (mistral, phi3, qwen2.5:7b)
  └─ Context window: 4K–128K depending on model
    ↓
Response returned via Tailscale mesh
```

## Context Budget Breakdown

| Source | Typical Tokens | Notes |
|---|---|---|
| System prompt | 2K–8K | Instructions, skills, role |
| Conversation history | 5K–50K | Grows per turn |
| File context (#refs) | 1K–20K | Open files, selections |
| MCP tool defs | 500–3K | Tool schemas |
| User message | 100–2K | Current prompt |
| **Total sent** | **~10K–80K** | Varies by task |

## See Also

- [model-routing](model-routing.md) — AUTO selection logic
- [copilot-pro](../entities/copilot-pro.md)
- [openclaw](../entities/openclaw.md)
- [[fleet-capability-tagging-patterns-2026-04-28]]

See also: [[wiki-pattern]], [[dashboard-comparable-tools]], [[dashboard-world-class-research]]

See also: [[fleet-architecture]], [[github-integration]]
