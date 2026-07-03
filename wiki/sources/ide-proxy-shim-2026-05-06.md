---
title: Claude Code IDE Proxy Shim — R&D
type: source
created: 2026-05-06
tags: [cost-reduction, ide-proxy, anthropic, litellm, fleet, claude-code]
related: ["[[hamr-core-worker]]", "[[cache-adapters]]", "[[header-spillover]]"]
status: complete
---

# IDE Proxy Shim R&D

R&D for Epic #1020. Recommends adopting LiteLLM proxy as the IDE backend rather than building a custom Node proxy. LiteLLM already exposes Anthropic-compatible `/v1/messages`; routing to Tailscale Ollama / CF AI / OpenRouter is config-only.

## Decisions
- Architecture A (local Node proxy) recommended for MVP — but adopting LiteLLM proxy directly is simpler.
- Latency budget ≤50ms p95 achievable.
- Fleet pass rate ≥85% on bands 1–2 = activation gate.
- Anthropic key never reaches fleet; audit log per-decision in `~/.megingjord/ide-proxy-decisions.jsonl`.

## Child sketch (6 items, ~5d total)
1. Adopt LiteLLM proxy + wire `litellm-config.yaml` for Anthropic-compat `/v1/messages` (1d).
2. Complexity-score classifier as LiteLLM pre-router hook (1.5d).
3. Per-call cost-telemetry emit (0.5d).
4. Activation script + supervisor (0.5d).
5. Live A/B measurement child (1d, post-impl).
6. Documentation (0.5d).

## Source
`research/ide-proxy-shim-2026-05-06.md` (Epic #1020, R&D #1021).
