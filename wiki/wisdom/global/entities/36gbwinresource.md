---
title: "36GB Windows Resource"
type: entity
created: 2026-04-28
updated: 2026-05-02
tags: [fleet, device, inference, gpu, system-service-ollama]
sources: ["[[devenv-fleet-topology]]", "[[fleet-resource-audit-2026-05-01]]", "[[fleet-hardware-optimization-2026-05-01]]"]
related: ["[[windows-laptop]]", "[[openclaw]]", "[[penguin-1]]", "[[model-routing]]", "[[cascade-dispatch]]"]
status: current
---

# 36GB Windows Resource

Primary fleet inference node for heavy local coding workloads. Now operates
under SYSTEM-service Ollama for env-var-honoring KEEP_ALIVE and reboot
survival.

## Specs

- CPU: Intel Core i5-9400H
- RAM: 32 GB
- GPU: NVIDIA Quadro T2000 (4 GB VRAM)
- OS: Windows 11 Pro
- Tailscale IP: 100.91.113.16

## Operating mode (post-2026-05-01 IT pass)

- Ollama runs as **SYSTEM-service scheduled task** (`ollserv`, ONSTART, RU SYSTEM, RL HIGHEST)
- Tray app retired
- Pagefile increased to 24-32 GB (Win32_PageFileSetting)
- Defender exclusions for `~\.ollama\` + `ollama.exe` + `ollama app.exe`
- Machine-scope env vars: `OLLAMA_KEEP_ALIVE=24h`, `NUM_PARALLEL=4`, `MAX_LOADED_MODELS=3`, `FLASH_ATTENTION=1`, `HOST=0.0.0.0:11434`, `MODELS=C:\Users\chf31\.ollama\models`

## Services

- Ollama on port 11434

## Models installed (as of 2026-05-02)

| Model | Size | Tier | Warm TPS | VRAM | CPU offload |
|---|---|---|---|---|---|
| qwen2.5-coder:32b | 19.85 GB | max-quality | 1.6 | 3.04 GB | 87% |
| qwen2.5-coder:7b | 4.68 GB | (legacy, lower priority) | 22 | 3.21 GB | 39% |
| qwen2.5-coder:7b-instruct-q3_K_S | 3.49 GB | fallback for 7B-class | 29.5 | 3.27 GB | 21% |
| starcoder2:3b | 1.71 GB | FIM completion | 95 | 1.90 GB | 0% (full GPU) |
| granite-code:3b | 2.00 GB | instruct fallback | 51 | 2.83 GB | 0% (full GPU) |

**Saturation behavior**: only 1 model fits in VRAM at a time on the 4 GB
card; each load evicts the previous. The 3B models fully utilize GPU; the
7B and 32B models split GPU+CPU. `qwen2.5-coder:32b` is the heaviest
quality option and uses ~22.5 GB total RAM with 87% CPU offload.

## Routing role

- `tier`: performance
- `inferenceClass`: heavy-coding
- `priority`: 100
- Preferred for: implement, refactor, tests, batch, multi-file
- FIM tasks → starcoder2:3b (fastest, fully GPU-resident)
- Heavy reasoning → qwen2.5-coder:32b (slowest TPS, highest quality)

## Maintenance notes

- KEEP_ALIVE env var was historically unreliable when Ollama ran as a
  user-scope tray app; the SYSTEM-service migration (2026-05-02) fixed
  this. Per-request `keep_alive: "24h"` in JSON body remains a
  deterministic override and is the preferred pattern at the routing layer.
- See `.dashboard/it-notes/fleet-upgrade-2026-05-01.md` (gitignored, IT-local) for the
  authoritative operational runbook.

See: [[model-routing]], [[cascade-dispatch]], [[fleet-architecture]]
