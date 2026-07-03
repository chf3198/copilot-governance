---
title: "Fleet Hardware Optimization 2026-05-01"
type: source
created: 2026-05-01
updated: 2026-05-01
tags: [fleet, infrastructure, ollama, llamafile, gpu, cpu, slm, qwen3-coder, minilm, flashrank, optimization]
sources: [/home/curtisfranks/devenv-ops/research/fleet-hardware-optimization-2026-05-01.md]
related: ["[[36gbwinresource]]", "[[openclaw]]", "[[penguin-1]]", "[[fleet-architecture]]", "[[cascade-dispatch]]", "[[model-routing]]"]
status: draft
---

# Fleet Hardware Optimization 2026-05-01

## Summary

Three-workstream research for #734 covering 36gbwinresource (4 GB VRAM GPU),
OpenClaw (16 GB CPU), and penguin-1 (<1 GB SLM). Each workstream produced a
candidate matrix and recommendation; an independent Cerebras second opinion
flagged complexity guards and resource-exhaustion risks. Phased adoption is
6 steps starting with baseline restoration and ending with SLM utility
deployment.

## Recommendations (decision-locked)

- **36gbwinresource**: Qwen3-coder 4B as primary; qwen2.5-coder:7b at IQ3/Q3
  as fallback. Set `num_ctx=2048` for KV headroom.
- **OpenClaw**: switch from Ollama to **llamafile** single-binary on the
  same qwen2.5-coder:7b Q4_K_M model — ~50% CPU speedup per Justine Tunney
  matmul work. Keep OpenClaw aggregator role.
- **penguin-1**: phased install of (1) tool-runner sandbox MCP server,
  (2) MiniLM-L6-v2 embedder, (3) FlashRank reranker.

## Replicability

All three recommendations apply to any host of equivalent hardware tier,
not just the specific machines this operator owns. Workstream 1 covers any
4 GB VRAM card; workstream 2 any 16 GB CPU host; workstream 3 any sub-1 GB
always-on Linux device.

## Entities updated by this research

- 36gbwinresource: primary model recommendation moves from qwen2.5-coder:7b
  to Qwen3-coder 4B
- OpenClaw: engine moves from Ollama to llamafile (same model)
- penguin-1: gains MCP tool-runner role plus embedder/reranker utilities

## Cross-links

- See [[fleet-architecture]] for system map
- See [[cascade-dispatch]] for routing semantics
- See [[model-routing]] for tier policy
- See `research/fleet-hardware-optimization-2026-05-01.md` for full matrix
- Implementation companion: ticket #765
- Maintenance loop research: ticket #766
- Source audit: `wiki/sources/fleet-resource-audit-2026-05-01.md`
