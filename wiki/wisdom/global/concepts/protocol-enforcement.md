---
title: Protocol Enforcement Architecture
type: concept
created: 2026-07-13
status: final
tags: [enforcement, governance, hooks, instructions, skills, bypass-prevention]
---

# Protocol Enforcement Architecture

How DevEnv Ops makes protocol bypass impossible through layered
enforcement across hooks, instructions, skills, agents, and CI.

## Design Principle: Defense in Depth

No single layer is sufficient. Each layer catches what the previous
layer missed. The agent cannot skip governance because **every
lifecycle point** has an enforcement checkpoint.

## Layers 1-5: Hook-Based Deterministic Enforcement

| Layer | Hook Event | Script | What It Does |
|---|---|---|---|
| 1 | SessionStart | session_context.py | Inject baton protocol, repo-type profile, health gaps |
| 2 | UserPromptSubmit | userprompt_gate.py | Classify task lane, block premature closeout |
| 3 | PreToolUse | pretool_guard.py | Block dangerous cmds, enforce admin sequencing |
| 4 | PostToolUse | posttool_reminders.py | Track file touches, inject baton reminders |
| 5 | Stop | stop_reminder.py | Block session end if admin baton incomplete |

**Bypass resistance**: PreToolUse `permissionDecision: "deny"` and
Stop `decision: "block"` are platform-enforced — agent cannot override.
State tracking is automatic — agent cannot claim it didn't touch code.

## Layers 6-9: Advisory + Persona Enforcement

| Layer | Mechanism | Files | Enforcement Type |
|---|---|---|---|
| 6 | Always-on instructions | copilot-instructions.md, AGENTS.md | Every request |
| 7 | File-based instructions | .instructions.md with applyTo globs | Pattern-matched |
| 8 | Skills (33 deployed) | skills/*/SKILL.md | On-demand loading |
| 9 | Custom agents (8) | agents/*.agent.md | Persona-bound + scoped hooks |

## Layer 10: CI Gate (Server-Side Backstop)

`.github/workflows/global-governance-presence.yml` fails PR if
required governance files are missing. Server-side, tamper-resistant.

## Current Coverage Matrix

| Enforcement Point | Hook | Script | Status |
|---|---|---|---|
| Session init context | SessionStart | session_context.py | ✅ Active |
| Prompt classification | UserPromptSubmit | userprompt_gate.py | ✅ Active |
| Dangerous cmd block | PreToolUse | pretool_guard.py | ✅ Active |
| Admin sequencing | PreToolUse | pretool_guard.py | ✅ Active |
| Post-tool state track | PostToolUse | posttool_reminders.py | ✅ Active |
| Session completion | Stop | stop_reminder.py | ✅ Active |
| Subagent governance | SubagentStart | — | ❌ Gap |
| Context compaction | PreCompact | — | ❌ Gap |

## Identified Gaps & Next Steps

1. **SubagentStart hook**: No governance injection into subagents.
   Subagents can operate without baton protocol awareness.
2. **PreCompact hook**: Critical governance state may be lost when
   context is compacted. Need to persist state before truncation.
3. **repo-scope.json**: Currently `default_enabled: false` with
   empty `enabled_repos`. Must flip to `default_enabled: true`.
4. **Agent-scoped hooks**: Not yet leveraged. Each custom agent
   should carry enforcement hooks in its frontmatter.
5. **Hook script edit protection**: `chat.tools.edits.autoApprove`
   should exclude `hooks/scripts/` to prevent self-modification.

See also: [[copilot-hooks-api]], [[governance-enforcement]],
[[baton-protocol]], [[agent-drift]]

[copilot-hooks-api]: ../sources/copilot-hooks-api.md "Copilot Chat Hooks API"
[governance-enforcement]: governance-enforcement.md "Governance Enforcement"
[baton-protocol]: baton-protocol.md "Baton Protocol (Role Handoff)"
[agent-drift]: agent-drift.md "Agent Drift"
