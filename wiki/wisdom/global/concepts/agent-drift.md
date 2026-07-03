---
title: "Agent Drift"
type: concept
created: 2026-04-14
updated: 2026-04-14
tags: [governance, architecture, copilot]
sources: []
related: ["[[baton-protocol]]", "[[self-annealing]]", "[[governance-enforcement]]"]
status: draft
---

# Agent Drift

Progressive divergence of agent behavior from intended instructions.

## Root Causes (7 identified)
1. Attention decay over long contexts
2. Context rot from stale instructions
3. Inherited goal drift from conversation history
4. Helpfulness bias overriding constraints
5. Intent mismatch between user and agent
6. KV cache artifacts in long sessions
7. Drift as bounded equilibrium (not linear)

## Mitigation Patterns
- Periodic instruction reinforcement
- Context replication at transition points
- Drop-box memory persistence
- Executable constraint transformation
- [[self-annealing]] review cycles

See: [[agent-drift-governance]], [[agent-drift-mitigations]], [[agent-drift-copilot]], [[agent-drift-frameworks]], [[agent-drift-root-causes]], [[agent-drift-sources]], [[tiered-research-findings]]
