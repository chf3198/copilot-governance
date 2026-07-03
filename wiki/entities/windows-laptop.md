---
title: "Windows Laptop (OpenClaw Host)"
type: entity
created: 2026-04-14
updated: 2026-05-01
tags: [fleet, device, openclaw]
sources: ["[[openclaw-windows-optimization-2026]]", "[[fleet-model-upgrades-implementation-2026-05-01]]"]
related: ["[[penguin-1]]", "[[openclaw]]", "[[tailscale-mesh]]"]
status: draft
---

# Windows Laptop (OpenClaw Host)

Secondary fleet machine hosting [[openclaw]] gateway.

## Specs
- CPU: Intel Core i7-10510U
- RAM: 16GB
- GPU: none
- OS: Windows

## Role in Fleet
- Hosts [[openclaw]] API gateway and local Ollama runtime
- Serves coding models sized for CPU throughput first
- Reachable from [[penguin-1]] via [[tailscale-mesh]]

## Services
- Ollama on port 11434
- OpenClaw gateway on port 4000 (tailnet bind)
- Tailscale IP (current): 100.78.22.13

## Benchmarks (2026-05-01)
- Primary: `qwen2.5-coder:1.5b` Q4_K_M — 8.36 tok/s warm at `num_ctx=2048`
- Fast fallback: `starcoder2:3b` — 4.12 tok/s warm
- Quality fallback: `qwen2.5-coder:7b` remained below the target on CPU

## Operational Notes
- 2026-04-23 hardening moved gateway from loopback-only `127.0.0.1:18789`
	to tailnet-reachable `100.78.22.13:4000`.
- Fleet preflight now succeeds against `/health` at port 4000.
- `OLLAMA_KEEP_ALIVE=24h` confirmed at machine scope.
- New models installed: `qwen2.5-coder:1.5b`, `granite-code:3b`, `starcoder2:3b`.

See: [[hardware-evaluation]], [[free-tier-inventory]]
