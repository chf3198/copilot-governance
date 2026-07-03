---
title: "Governance Enforcement"
type: concept
created: 2026-04-14
updated: 2026-04-14
tags: [governance, architecture, copilot]
sources: []
related: ["[[baton-protocol]]", "[[agent-drift]]", "[[self-annealing]]", "[[linting-governance]]"]
status: draft
---

# Governance Enforcement

4-layer system ensuring agent compliance with standards.

## Enforcement Layers
1. **Instructions** — Global + repo-scoped rules
2. **Hooks** — Pre/post tool automation
3. **Skills** — Domain knowledge + protocols
4. **Bootstrap** — Session initialization checks

## Enforcement Points
| Layer | Mechanism | Bypass Risk |
|-------|-----------|-------------|
| Instructions | Loaded by VS Code | Low (always present) |
| Hooks | Python scripts | Medium (can be disabled) |
| Skills | Loaded on demand | High (may not be loaded) |
| Bootstrap | One-time at session start | High (skipped if forgotten) |

## Key Controls
- Branch name validation (pre-commit)
- Event emission (mandatory per Admin skill)
- Drift detection (Consultant CLOSEOUT)
- Ticket lifecycle enforcement (Manager gates)

See: [[workflow-design]], [[copilot-governance-actions]]

See also: [[help-best-practices]], [[help-section-structure]], [[dashboard-codebase-gold-rules]]
