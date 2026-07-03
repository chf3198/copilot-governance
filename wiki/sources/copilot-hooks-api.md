---
title: Copilot Chat Hooks API
type: source
created: 2026-07-13
status: final
tags: [copilot, hooks, enforcement, lifecycle, api]
---

# Copilot Chat Hooks API — Research Findings

VS Code agent hooks (Preview) execute shell commands at 8 lifecycle
points during agent sessions. Hooks receive JSON via stdin, return
JSON via stdout, and use exit codes for control flow.

## 8 Lifecycle Events

| Event | Fires When | Enforcement Use |
|---|---|---|
| SessionStart | First prompt of new session | Inject governance context, validate project state |
| UserPromptSubmit | User submits any prompt | Audit requests, inject system context, route tasks |
| PreToolUse | Before agent invokes any tool | Block dangerous ops, deny/allow/ask per tool |
| PostToolUse | After tool completes | Run formatters, inject baton reminders |
| PreCompact | Before context compaction | Export critical state before truncation |
| SubagentStart | Subagent spawned | Track nested agents, inject governance context |
| SubagentStop | Subagent completes | Aggregate results, prevent premature stop |
| Stop | Agent session ends | Block stop if admin baton incomplete |

## Hook File Locations (Priority Order)

1. **Workspace**: `.github/hooks/*.json` (highest)
2. **Claude format**: `.claude/settings.json`, `.claude/settings.local.json`
3. **User-global**: `~/.copilot/hooks/` (deployed from devenv-ops)
4. **Agent-scoped**: `hooks` field in `.agent.md` frontmatter
5. **Plugin**: `hooks.json` in plugin package

Workspace hooks override user hooks for same event type.

## Input/Output Schema

**Common input** (all hooks): `timestamp`, `cwd`, `sessionId`,
`hookEventName`, `transcript_path`.

**Common output**: `continue` (bool), `stopReason` (string),
`systemMessage` (string, always shown to user).

**Exit codes**: 0=success (parse stdout), 2=blocking error (stop
and show stderr to model), other=non-blocking warning.

## PreToolUse — Primary Enforcement Point

Input adds: `tool_name`, `tool_input`, `tool_use_id`.
Output `hookSpecificOutput` fields:
- `permissionDecision`: "allow" | "deny" | "ask"
- `permissionDecisionReason`: shown to user
- `updatedInput`: modified tool input (schema must match)
- `additionalContext`: extra context for model

Multiple hooks: most restrictive decision wins (deny > ask > allow).

## Stop — Session Completion Gate

Input adds: `stop_hook_active` (bool, prevents infinite loops).
Output: `decision: "block"` with `reason` forces agent to continue.
Critical for enforcing admin baton completion before session end.

## SubagentStart/Stop — Nested Agent Control

SubagentStart injects `additionalContext` into subagent conversation.
SubagentStop can block subagent completion with `decision: "block"`.
Both receive `agent_id` and `agent_type`.

## Agent-Scoped Hooks (Preview)

Defined in `.agent.md` YAML frontmatter. Only run when that agent
is active. Run in addition to workspace/user hooks. Requires
`chat.useCustomAgentHooks: true`.

## Safety Considerations

- Hooks execute with same permissions as VS Code
- Agent can edit hook scripts during its own run
- Use `chat.tools.edits.autoApprove` to block hook script edits
- Validate all stdin input to prevent injection
- Never hardcode secrets in hook scripts

## Sources

- [VS Code Hooks Docs](https://code.visualstudio.com/docs/copilot/customization/hooks)
- [Custom Instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [Customization Concepts](https://code.visualstudio.com/docs/copilot/concepts/customization)
