---
title: "Token Telemetry Capability Matrix 2026-05-01"
type: source
created: 2026-05-01
updated: 2026-05-01
tags: [telemetry, tokens, cost, providers]
sources: ["/home/curtisfranks/devenv-ops/research/token-telemetry-capability-matrix-2026-05-01.md"]
related: ["[[openclaw]]", "[[36gbwinresource]]"]
status: active
confidence: high
last_verified: 2026-05-01
---

# Token Telemetry Capability Matrix 2026-05-01

## Summary

Research confirms exact request-level token fields are available for Anthropic Messages, Claude Code OTel events, OpenRouter, Gemini, and Ollama. LiteLLM is reliable for spend reporting when pricing maps stay current. Copilot remains a constrained lane where universal exact internal token ledgers are not externally exposed in a way this harness can guarantee across all plans/surfaces.

## Entities

- GitHub Copilot
- Claude Code
- Anthropic Admin API
- OpenRouter
- LiteLLM
- Gemini API
- Ollama

## Concepts

- Token normalization
- Confidence labeling
- Request-level vs aggregate telemetry
- Non-free lane governance

## Claims

- A canonical schema with confidence levels is required to avoid mixing exact and estimated lanes.
- Copilot should be tracked as estimated unless exact provider-grade usage APIs become available for this environment.
- Non-free lanes should be priority-gated for exact or derived-exact telemetry before broad rollout.

## See Also

- [[openclaw]]
- [[36gbwinresource]]
- [[token-telemetry-unified-design-2026]]
