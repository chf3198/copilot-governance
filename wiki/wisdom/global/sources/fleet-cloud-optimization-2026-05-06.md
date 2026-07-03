---
title: Fleet & Cloud Resource Optimization — R&D
type: source
created: 2026-05-06
tags: [cost-reduction, fleet, cloudflare-ai, tailscale-aperture, portability]
related: ["[[hamr-core-worker]]", "[[substrate-health]]"]
status: complete
---

# Fleet & Cloud Resource Optimization R&D

R&D for Epic #949 (re-scoped 2026-05-06). Active scope: §3 Tailscale Aperture, §4 Cloudflare AI 2026 catalog, §5 fleet-portability. (§1/§2 obsolete; §6 carved to #1020.)

## Decisions
- **Aperture vs LiteLLM**: keep LiteLLM as primary; Aperture deferred until Tailscale beta exits + plan permits. Hybrid path possible via Aperture's MCP `/v1/mcp` aggregator.
- **Cloudflare AI 2026 free tier**: 10K Neurons/day. Register `qwen3-30b-a3b-fp8`, `gpt-oss-120b`, `gemma-4-26b-a4b-it`, `granite-micro` as named LiteLLM groups (`cloud-fleet-{primary,quality,fast}`).
- **Fleet portability**: ship `fleet-discover.sh` + `devices.example.json` + skill walkthrough so new operators don't inherit Curtis's specific topology.

## Child sketch (8 items, ~5.5d total)
1. LiteLLM config evolution (1d).
2. Inventory CF AI catalog refresh (0.5d).
3. LiteLLM named groups for CF AI (0.5d).
4. fleet-config.js MagicDNS + relay probe (1d).
5. substrate-health.js CF AI probe (0.5d).
6. fleet-discover.sh + devices.example.json (1d).
7. fleet-portable-config skill (0.5d).
8. Aperture integration evaluation R&D (0.5d).

## Source
`research/fleet-cloud-optimization-2026-05-06.md` (Epic #949, R&D #950).
