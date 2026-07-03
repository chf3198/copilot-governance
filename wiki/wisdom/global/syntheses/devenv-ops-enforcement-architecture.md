---
title: DevEnv Ops Enforcement Architecture
type: synthesis
created: 2026-07-13
status: final
tags: [enforcement, plan, hooks, bootstrap, onboarding]
---

# DevEnv Ops Enforcement Architecture — Synthesis

This synthesis connects research findings from [[copilot-hooks-api]]
with the concept model in [[protocol-enforcement]] to produce an
actionable enforcement plan for the DevEnv Ops system.

## Executive Summary

DevEnv Ops already has **strong enforcement** through 5 active hooks
covering SessionStart, UserPromptSubmit, PreToolUse, PostToolUse,
and Stop. The system tracks governance state, blocks dangerous
operations, enforces admin sequencing, and prevents premature
session completion. **Two gaps remain**: SubagentStart governance
injection and PreCompact state preservation.

## What "Cannot Bypass" Means

The VS Code hooks API enforces decisions at the platform level:
- `permissionDecision: "deny"` is absolute — agent cannot override
- `Stop.decision: "block"` forces agent continuation
- Exit code 2 stops processing and shows error to model
- `systemMessage` displays to user regardless of agent behavior

This makes hooks **deterministic** unlike instructions (advisory).

## Current State: 5 Hooks, 20 Scripts, 33 Skills

| Component | Count | Enforcement Type |
|---|---|---|
| Active hook events | 5 of 8 | Deterministic (platform-enforced) |
| Hook scripts | 20 Python files | State tracking + gate logic |
| Global skills | 33 | Advisory (context injection) |
| Global instructions | 12 | Advisory (always-on context) |
| Custom agents | 8 | Persona-bound tool + hook scoping |
| CI gates | 1 | Server-side presence check |

## Onboarding a Repo: The Bootstrap Path

When `global-skills-bootstrap` runs on a new repo:

1. Creates `.github/instructions/global-skills.instructions.md`
2. Creates `.github/scripts/check-global-governance.sh`
3. Creates `.githooks/pre-commit` and `.githooks/pre-push`
4. Creates `.github/workflows/global-governance-presence.yml`
5. Sets `git config core.hooksPath .githooks`

**User-global hooks** (`~/.copilot/hooks/global-standards.json`)
apply to ALL repos automatically. No per-repo opt-in needed.

## Gap Remediation Plan

| # | Gap | Priority | Action |
|---|---|---|---|
| 1 | SubagentStart hook | HIGH | Create `subagent_context.py`, add to `global-standards.json` |
| 2 | PreCompact hook | MEDIUM | Create `precompact_state.py`, persist state before truncation |
| 3 | repo-scope.json | HIGH | Flip `default_enabled: true` (currently false) |
| 4 | Agent-scoped hooks | LOW | Add `hooks` field to `.agent.md` frontmatter files |
| 5 | Script self-mod | MEDIUM | Exclude `hooks/scripts/` from auto-approve edits |

## Enforcement Confidence Assessment

| Layer | Confidence | Notes |
|---|---|---|
| PreToolUse (deny) | 99% | Platform-enforced, cannot override |
| Stop (block) | 95% | Can loop if stop_hook_active missed |
| SessionStart inject | 90% | Context may be ignored by model |
| Instructions | 70% | Advisory, model may not follow |
| Skills | 65% | On-demand, may not load |
| CI gates | 99% | Server-side, tamper-resistant |

## Recommended Implementation Order

1. Flip `repo-scope.json` to `default_enabled: true`
2. Create SubagentStart hook script
3. Create PreCompact hook script
4. Add hook script edit protection setting
5. Add agent-scoped hooks to custom agents

See also: [[protocol-enforcement]], [[copilot-hooks-api]],
[[governance-enforcement]], [[baton-protocol]]
