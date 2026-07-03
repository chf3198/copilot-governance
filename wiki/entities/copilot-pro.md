---
title: "GitHub Copilot Pro"
type: entity
created: 2026-04-14
updated: 2026-04-14
tags: [copilot, service, inference]
sources: []
related: ["[[penguin-1]]", "[[tiered-agent-architecture]]", "[[baton-protocol]]"]
status: draft
---

# GitHub Copilot Pro

Premium AI coding assistant running on [[penguin-1]].

## Capabilities
- VS Code Chat (Claude, GPT-4o, Gemini)
- Agent mode with tool use
- Custom instructions + skills system
- MCP server integration

## Governance Integration
- [[baton-protocol]] enforced via global instructions
- Skills loaded from ~/.copilot/skills/ (34 skills)
- Instructions from ~/.copilot/instructions/ (12 files)
- Hooks from ~/.copilot/hooks/ (6 scripts)

## Cost Management
- [[prompt-reduction-playbook]] minimizes premium burns
- [[tiered-agent-architecture]] routes free-tier first
- [[openclaw]] handles bulk inference

See: [[copilot-governance-actions]], [[agent-drift-governance]]

See also: [[copilot-skills-system]]
