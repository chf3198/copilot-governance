---
name: IDE Proxy
description: Optional opt-in shim that routes Claude Code IDE chat backend through the harness for cost reduction.
type: instructions
---

# IDE Proxy (Wave 9 child D, Epic #1020)

The IDE proxy intercepts Claude Code's chat backend so sub-Premium-complexity
turns route to fleet/free providers while Premium turns pass through to
Anthropic Opus unchanged. **Opt-in only**; default behavior is unchanged.

## Activation

```bash
npm run hamr:ide-proxy:start    # starts LiteLLM proxy on localhost:11437
# Then in Claude Code IDE settings, set:
#   api_endpoint = http://127.0.0.1:11437/v1/messages
```

Stop with `npm run hamr:ide-proxy:stop`. PID file at `~/.megingjord/ide-proxy.pid`;
logs at `~/.megingjord/ide-proxy.log`. Per-call audit log at
`~/.megingjord/ide-proxy-decisions.jsonl`.

## What gets routed where

| Complexity band | Lane | Provider |
|---|---|---|
| 1-2 lookup, slot-fill | Free | Tailscale Ollama (`qwen2.5-coder:7b` on 36GB GPU) |
| 3 single-file edit | Haiku | Anthropic Haiku 4.5 (cheap-cloud) |
| 4-5 multi-file, architecture | Premium | Anthropic Opus 4.7 (passthrough) |

Activation gate: fleet pass rate ≥ 85% on bands 1-2 (measured via #1035
A/B test). Below threshold → keep Anthropic for that band.

## Opt-out

`MEGINGJORD_HAMR_DISABLED=1` env var. Or stop the proxy and clear IDE config.

## Source

`research/ide-proxy-shim-2026-05-06.md` (R&D #1021).
