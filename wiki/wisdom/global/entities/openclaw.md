---
title: "OpenClaw Gateway"
type: entity
created: 2026-04-14
updated: 2026-05-02
tags: [fleet, service, inference, system-service-ollama, deepseek-coder-v2]
sources: ["[[openclaw-windows-optimization-2026]]", "[[fleet-resource-audit-2026-05-01]]", "[[fleet-hardware-optimization-2026-05-01]]"]
related: ["[[windows-laptop]]", "[[36gbwinresource]]", "[[penguin-1]]", "[[model-routing]]", "[[tiered-agent-architecture]]", "[[cascade-dispatch]]"]
status: current
---

# OpenClaw Gateway

CPU-only inference host. Now operates under SYSTEM-service Ollama with
deepseek-coder-v2:lite as primary model — 16B MoE delivering ~140% better
TPS than the prior dense 7B baseline.

## Architecture

- Ollama on port 11434 (SYSTEM-service `ollserv` scheduled task)
- Fleet integration: target for `fleet-coder` lane dispatch
- Network scope: Tailscale mesh only
- New admin account `desktop-909a7km\admin` (replaces prior shared account)

## Operating mode (post-2026-05-02 IT pass)

- Tray app retired; SYSTEM-service `ollserv` runs `ollama serve` at boot
- Pagefile increased to 24-32 GB
- Defender exclusions for `~\.ollama\` + ollama executables
- Machine-scope env vars: `OLLAMA_KEEP_ALIVE=24h`, `NUM_PARALLEL=4`, `MAX_LOADED_MODELS=3`, `FLASH_ATTENTION=1`, `HOST=0.0.0.0:11434`, `MODELS=C:\Users\Admin\.ollama\models`

## Specs

- CPU-only (no GPU)
- 16 GB RAM, 15.8 GB visible
- Windows 10
- Tailscale IP: 100.78.22.13

## Models installed (as of 2026-05-02)

| Model | Size | Tier | Warm TPS |
|---|---|---|---|
| **deepseek-coder-v2:lite** | 8.91 GB | **primary** (16B MoE, ~2.4B active per token) | **8.4** |
| granite-code:20b | 11.55 GB | max-quality dense alternative | ~1-2 |
| qwen2.5-coder:7b | 4.68 GB | legacy fallback | 3.5 |
| qwen2.5:7b-instruct | 4.68 GB | legacy fallback | 3.5 |

**Saturation behavior**: cannot hold both deepseek (9.9 GB) and granite-20b (12 GB) simultaneously on the 16 GB host; operates as **single-model warm cache** with 24h keep-alive, switching only when an explicit different model is requested.

## Routing role

- `tier`: standard
- `inferenceClass`: coding
- `priority`: 60
- Preferred for: integration, tests, migration, workflow
- Default model: **deepseek-coder-v2:lite** (best CPU TPS in MoE class)
- Heavy reasoning: granite-code:20b (slower, higher quality)

## Failover chain (when OpenClaw unavailable)

1. OpenClaw (local fleet) — free, low latency, this entity
2. 36gbwinresource (GPU fleet) — preferred for FIM/short completions
3. Groq cloud (llama-3.3-70b-versatile) — fast, rate-limited
4. Cerebras (qwen-3-235b) — fast, limited capacity
5. Anthropic Haiku — paid fallback

## Maintenance notes

- KEEP_ALIVE env var was historically unreliable when Ollama ran as a tray
  app under a now-retired user. SYSTEM-service migration (2026-05-02) fixed
  the env-var inheritance issue.
- See `.dashboard/it-notes/fleet-upgrade-2026-05-01.md` (gitignored, IT-local) for the
  authoritative operational runbook.

See: [[36gbwinresource]], [[penguin-1]], [[fleet-architecture]], [[cascade-dispatch]]
