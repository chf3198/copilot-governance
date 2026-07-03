---
title: "Megingjord Harness"
type: concept
created: 2026-05-11
updated: 2026-05-11
tags: [governance, harness]
sources: []
related: ["[[harness-goals]]", "[[baton-protocol]]", "[[governance-enforcement]]", "[[self-annealing]]"]
status: draft
---

# Megingjord Harness

The governance and agentic-workflow harness for cross-team AI software
engineering. Rebranded from DevEnv Ops on 2026-04-29.

## Purpose

Coordinate three independent AI teams (Claude Code, Copilot, Codex) plus
human operator through a structured Agile baton workflow with deterministic
gates, role-bound authority, and observable governance.

## Core primitives

- **Baton workflow** (`[[baton-protocol]]`): Manager → Collaborator → Admin →
  Consultant, with single-active-role-per-ticket and signed handoff
  artifacts at each transition.
- **Goal Constitution** (`[[harness-goals]]`): priority-ordered G1..G9
  goals that drive every decision when tradeoffs occur.
- **Governance enforcement** (`[[governance-enforcement]]`): four-layer
  system (instructions, hooks, skills, bootstrap) that prevents drift.
- **Self-annealing** (`[[self-annealing]]`): bounded review pass that
  detects and corrects drift, with three-tier escalation per Epic #1308.
- **Cross-team routing** (`[[free-router]]` + `[[cascade-dispatch]]`):
  cost-ascending lane selection enforcing G3 Zero Cost without sacrificing
  G2 Quality.

## Substrate

Runs on three team substrates (`claude-code-cli`, `github-copilot`,
`codex-cli`/`codex-vscode-ide`) plus shared CI/CD via GitHub Actions and
HAMR (Cloudflare Worker for cross-team cost/observability mechanics).

## Top-level instruction surfaces

All bound via `CLAUDE.md`:

- `role-baton-routing.instructions.md` — baton state machine
- `epic-governance.instructions.md` — Epic-specific rules (Rule E2/E3/E5)
- `workflow-resilience.instructions.md` — three-tier self-anneal
- `observability.instructions.md` — logging + monitoring (Epic #1339 C9)
- `hamr-routing.instructions.md` — HAMR mechanics

## See also

- `[[harness-goals]]` — the Goal Constitution
- `[[baton-protocol]]` — workflow primitive
- `[[governance-enforcement]]` — drift prevention
- `[[self-annealing]]` — drift correction
- `[[distributed-self-anneal]]` — three-tier extension
