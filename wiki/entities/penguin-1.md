---
title: "penguin-1 (SLM Utility Node)"
type: entity
created: 2026-04-14
updated: 2026-05-02
tags: [fleet, device, chromebook, slm, embeddings]
sources: ["[[fleet-resource-audit-2026-05-01]]", "[[fleet-hardware-optimization-2026-05-01]]"]
related: ["[[openclaw]]", "[[36gbwinresource]]", "[[tailscale-mesh]]", "[[model-routing]]", "[[cascade-dispatch]]"]
status: current
---

# penguin-1 (SLM Utility Node)

Off-network mobile Chromebook running ChromeOS + Linux LXC. Repurposed
2026-05-01 from "tiny chat fallback" to **dedicated SLM/embedder utility
node** that reduces upstream tokens before they hit the paid lanes.

## Specs

- ChromeOS + Linux LXC (Crostini-class container)
- ~880 MB free RAM working budget
- Tailscale IP: 100.86.248.35
- 326 ms RTT (mobile / off-network)
- Disk: tight — pulls fail at "no space left on device" without cleanup

## Operating mode (post-2026-05-01 IT pass)

- Holds 3 models loaded simultaneously under warm cache (~1.37 GB total)
- Per-request `keep_alive: "24h"` set by routing layer
- No GPU; all inference is CPU-only
- Reachable only over the Tailscale mesh; latency rules it out for
  interactive code completion

## Models installed (as of 2026-05-02)

| Model | Size | Tier | Warm TPS | Use |
|---|---|---|---|---|
| qwen3:0.6b | 0.52 GB | tiny chat / FIM | 56.7 | replaces retired qwen3.5:0.8b |
| gemma3:270m | 0.29 GB | ultra-low-RAM fallback | 37.7 | last-resort SLM |
| nomic-embed-text | 0.27 GB | text embedder | n/a | upstream RAG vectors |
| snowflake-arctic-embed:m | 0.22 GB | multilingual embedder | n/a | non-English / mixed text |

`qwen3.5:0.8b` was removed — not on the public Ollama registry, freed
1 GB of disk.

## Routing role

- `tier`: utility
- `inferenceClass`: embeddings + sub-2B chat
- `priority`: 30
- Preferred for: doc embedding, RAG vector generation, SLM extract/summarize
  (gemma3:270m), tool-runner sandbox over MCP
- **Not** for: interactive coding, FIM (RTT too high), reasoning
- See [[paid-token-floor-reduction-2026-05-01]] for the cost-reduction
  rationale that drove the role change.

## Failover chain (when penguin-1 unavailable)

1. penguin-1 (this entity) — embeddings + tiny chat
2. 36gbwinresource — starcoder2:3b for FIM, granite-code:3b for instruct
3. OpenClaw — deepseek-coder-v2:lite (slower than 36gb's GPU path)
4. Groq cloud — embeddings via free-tier
5. Anthropic Haiku — paid fallback

## Constraints

- Disk capacity is the binding constraint; future SLM additions may
  require Tailscale-mounted overlay or external storage
- High RTT (326 ms) makes this node unsuitable for synchronous request
  paths — use for async batch / pre-processing workloads only
- Browser tabs share RAM with the LXC; aggressive tab use can starve
  Ollama out of the working budget

## Maintenance notes

- See `.dashboard/it-notes/fleet-upgrade-2026-05-01.md` (gitignored,
  IT-local) for the authoritative operational runbook and post-install
  verification probes.
- penguin-1 is **not** the primary dev node. The dev workstation
  registered as `penguin` (Tailscale 100.87.216.75) is a separate
  device; penguin-1 is the mobile utility node.

See: [[36gbwinresource]], [[openclaw]], [[fleet-architecture]], [[cascade-dispatch]]
