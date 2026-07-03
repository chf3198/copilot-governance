---
title: "DevEnv Fleet Topology"
type: source
created: 2026-04-14
updated: 2026-04-28
tags: []
sources: [raw/articles/devenv-fleet-topology.md]
related: []
status: draft
---

# DevEnv Fleet Topology

## Summary

The fleet is now a four-device Tailscale mesh with capability-tag-aware routing.
`36gbwinresource` is the primary heavy-coding inference node, `windows-laptop`
is the standard fallback and OpenClaw host, `penguin-1` handles tiny-model work,
and `chromebook-2` remains the primary dev workstation.

## Entities
- chromebook-2 (Primary Chromebook IDE host)
- penguin-1 (Secondary Chromebook)
- windows-laptop (inference host)
- 36gbwinresource (GPU inference host)
- VS Code
- Copilot agent
- dashboard server
- Ollama
- Phi-3.5 mini
- OpenClaw/LiteLLM gateway
- Groq
- Cerebras
- Copilot Pro (Anthropic, OpenAI)
- Tailscale VPN
- memory watchdog

## Concepts
- Four-device development and inference setup using Tailscale mesh.
- Capability-tag-driven task→resource routing.
- Priority-based fleet target selection for coding workloads.
- Offloading heavy local inference to GPU-backed Windows resource.

*Source: raw/articles/devenv-fleet-topology.md*