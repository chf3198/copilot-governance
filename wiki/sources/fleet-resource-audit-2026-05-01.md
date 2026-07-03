---
title: "Fleet Resource Audit 2026-05-01"
type: source
created: 2026-05-01
updated: 2026-05-01
tags: [fleet, infrastructure, ollama, tailscale, cloud-providers, audit]
sources: [/home/curtisfranks/devenv-ops/raw/articles/fleet-resource-audit-2026-05-01.md]
related: ["[[36gbwinresource]]", "[[openclaw]]", "[[penguin-1]]", "[[fleet-architecture]]", "[[tailscale-mesh]]", "[[cascade-dispatch]]"]
status: draft
---

# Fleet Resource Audit 2026-05-01

## Summary

Live audit of the Megingjord fleet (Tailscale mesh + Ollama hosts + cloud providers). Tailscale mesh is fully healthy with direct routes to all four nodes. All three Ollama endpoints respond HTTP 200, but installed-model lists show drift vs `inventory/devices.json` (9 listed models not actually installed). Warm-token throughput regressed ~32–49% on both Windows hosts vs inventory baseline benchmarks, likely from default Ollama 1-min idle eviction (no `OLLAMA_KEEP_ALIVE` set).

Cloud providers split: Anthropic and Groq fully working; OpenAI account is `insufficient_quota` (key valid); OpenRouter has per-key cap set to $0 despite $5.26 in remaining account credits; Cerebras 429s on the 235B model under load (smaller models fine); Google AI Studio works on `gemini-2.5-flash` but our dispatcher targets the deprecated `gemini-2.0-flash`.

A `.env` parsing hazard was identified: `WINRESOURCE_36GB_SSH_PASSWORD` contains unquoted `&&&&&` which causes bash `source .env` to abort silently at line 40, leaving all downstream variables unset.

## Entities

- 36gbwinresource (100.91.113.16) — GPU Quadro T2000 4GB VRAM, qwen2.5-coder:7b at 22.0 tok/s warm
- OpenClaw / desktop-909a7km (100.78.22.13) — CPU 16GB, qwen2.5:7b-instruct + qwen2.5-coder:7b at 3.7 tok/s
- penguin-1 (100.86.248.35) — Linux LXC ≤880 MB free, qwen3.5:0.8b + gemma3:270m only
- Anthropic API — fully working
- Groq API — fully working, llama-3.3-70b-versatile primary
- Cerebras API — partial; small models OK, qwen-3-235b queue-exceeded under load
- Google AI Studio — gemini-2.5-flash works; gemini-2.0-flash deprecated
- OpenAI — key valid but account out of credits
- OpenRouter — per-key cap = $0; only `:free`-suffix models reachable

## Concepts

- Cold-load eviction risk → set `OLLAMA_KEEP_ALIVE=24h`
- Per-key spend caps (OpenRouter) distinct from account credits
- Bash vs dotenv parser divergence on shell metacharacters
- Inventory-vs-live drift detection (next: `inventory:reconcile` script)

## Performance baselines vs measured

| Host | Inventory tok/s | Measured tok/s | Delta |
|---|---|---|---|
| 36gbwinresource | 32.3 (GPU) | 22.0 | -32% |
| OpenClaw | 7.3 (CPU) | 3.7 | -49% |

## Recommendations

1. Set `OLLAMA_KEEP_ALIVE=24h` system env on Windows hosts (already in maintenanceNote on inventory)
2. Quote `.env` values containing `&` or other shell metacharacters
3. Update Gemini dispatch to `gemini-2.5-flash`
4. Raise OpenRouter per-key spend cap or pin dispatcher to `:free` models
5. Reconcile `inventory/devices.json` to live `/api/tags` (or install missing models)
6. Resolve OpenAI billing OR remove dispatch routes targeting it

## Per-device upgrade ideas

- 36gbwinresource: try qwen2.5-coder:7b at IQ3/Q3 for KV headroom; track Qwen3-coder 4B (April 2026)
- OpenClaw: switch from Ollama to llamafile/llama.cpp on same model for ~50% CPU speedup (no model size change)
- penguin-1: install MiniLM-L6-v2 embedder (~80 MB) + FlashRank reranker (<100 MB) for upstream-token reduction; expose tool-runner sandbox over Tailscale

## Related research

- Karpathy LLM Wiki v2 — typed relationships, decay-based trust audits
- Initializer-executor split agent harness pattern (Anthropic) — daemon-free scheduling
- Justine Tunney matmul work — llama.cpp CPU speedup
- all-MiniLM-L6-v2 — sentence-transformers model card

## Cross-links

- See [[openclaw]] for current entity entry
- See [[36gbwinresource]] for current entity entry
- See [[penguin-1]] for current entity entry
- See [[fleet-architecture]] for system topology
- See [[cascade-dispatch]] for routing semantics
