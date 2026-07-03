---
title: Claude Code IDE Proxy
type: concept
created: 2026-05-06
tags: [cost-reduction, ide-proxy, litellm, claude-code, anthropic]
related: ["[[hamr-core-worker]]", "[[cache-adapters]]"]
status: shipped (D1 + D6)
---

# Claude Code IDE Proxy

## Purpose

Reduce Claude Code IDE token cost by intercepting the chat backend so
sub-Premium-complexity turns route to fleet/free providers. Premium-tier
reasoning passes through to Anthropic Opus unchanged.

## Architecture

```
Claude Code IDE
   ↓ (Anthropic-compat wire format)
LiteLLM proxy (localhost:11437)
   ↓ (complexity-score classifier hook)
Lane decision: Free | Haiku | Premium
   ↓
   ├── Free  → Tailscale Ollama / Cloudflare AI free / OpenRouter free
   ├── Haiku → Anthropic Haiku 4.5
   └── Premium → Anthropic Opus 4.7 passthrough
```

## Modules

- `config/litellm-config.yaml` — alias `claude-opus-4-7` + `claude-haiku-4-5`
  enable Anthropic-compat `/v1/messages` route.
- `instructions/ide-proxy.instructions.md` — activation walkthrough.
- `scripts/global/ide-proxy-control.sh` (#1034) — start/stop/status.
- `scripts/global/ide-proxy-classifier.js` (#1032) — pre-router complexity hook.

## Activation gate (live measurement, #1035)

- Fleet pass rate ≥ 85% on complexity bands 1-2 → activate Free lane.
- Pass rate < 85% → keep on Anthropic Haiku as fallback.

## Cost reduction target

- ≥ 30% IDE turn count routed to non-Anthropic.
- ≥ 25% session-token-cost reduction vs baseline.
- Zero quality regression on Premium-tier turns.

## Source

- `research/ide-proxy-shim-2026-05-06.md` (R&D #1021).
- Epic #1020.
