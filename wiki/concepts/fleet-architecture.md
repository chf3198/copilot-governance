---
title: "Fleet Architecture"
type: concept
created: 2026-04-28
status: active
---
# Fleet Architecture

> Network zones, hardware nodes, software stacks, and message flow.

## Network Zones

```
┌─── CB-2 Local (dev) ─────────────────────────────────────────┐
│  [VS Code]──internal──[AUTO]──────────┐                       │
│  [VS Code]──────────────────────────────────purple──[GitHub]  │
│  [Wiki/STORE]                         │                       │
└───────────────────────────────────────│───────────────────────┘
                                        │ yellow (local route)
┌─── Tailscale VPN ─────────────────────▼───────────────────────┐
│  [OpenClaw/SW] ←──────── yellow ──────┘                       │
│  [OpenClaw/SW] ──green (inference)──► [Ollama 7B/LLM]         │
│  [CB-1/HW]    ──hosts──────────────► [Ollama SLM/LLM]         │
│  [Win/HW]     ──hosts──────────────► [OpenClaw/SW]            │
└───────────────────────────────────────────────────────────────┘
                      │ blue (cloud)
┌─── Cloud / Internet ▼─────────────────────────────────────────┐
│  [Copilot API/SVC]    [GitHub/SVC]                            │
│  Groq · Cerebras · OpenRouter                                 │
└───────────────────────────────────────────────────────────────┘
```

## Hardware Inventory

| Device | Role | Zone |
|---|---|---|
| CB-2 (Chromebook dev) | Dev workstation | Local |
| CB-1 (Chromebook SLM) | Dedicated SLM host | Tailscale |
| Win Laptop | Primary inference host | Tailscale |

## Software per Device

**CB-2**: VS Code, Copilot Chat, AUTO (agent loop), Wiki (storage)

**CB-1**: Ollama (SLM — small models), mem-watchdog

**Win Laptop**: OpenClaw gateway, Ollama 7B (inference)

## Flow Color Coding

| Color | Flow Type | Route |
|---|---|---|
| Blue | Cloud | AUTO → Copilot API |
| Yellow | Local | AUTO → OpenClaw |
| Green | Inference | OpenClaw → Ollama 7B |
| Purple | GitHub | VS Code → GitHub |
| Grey | Hosts | HW → software it hosts |
| White | Internal | VS Code → AUTO |
