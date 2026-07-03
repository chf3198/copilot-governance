---
title: Sandbox Worktree Governance Pack
type: synthesis
created: 2026-04-29
updated: 2026-04-30
tags: [governance, worktrees, drift-prevention, wiki]
status: active
---
# Sandbox Worktree Governance Pack

## Synthesis

Multi-agent development remains viable with dedicated worktrees only if launcher
branches are treated as disposable entrypoints and never as delivery branches.

The pack enforces this with three complementary layers:

1. **Session bootstrap**: reset launcher branch to `origin/main`, then create a
   ticket-linked task branch.
2. **Local prevention**: block direct commits on `sandbox/*` at pre-commit time.
3. **CI verification**: run an executable audit so launcher drift is observable.

## Why this avoids prior drift

- Converts policy text into executable checks.
- Makes branch-role misuse fail early, before PR creation.
- Reduces stale branch accumulation by standardizing session resets.
- Preserves merge-queue compatibility via `merge_group`-triggered workflows.

## Operator Workflow

1. `npm run worktree:start -- <copilot|codex|claude-code> feat/<issue#>-<slug>`
2. Implement and commit on task branch.
3. Open PR with `Refs #<issue>` and pass required checks.

## Linked Pages

- [[sandbox-worktree-governance-2026-04-29]]
- [[governance-enforcement]]
- [[ticket-lifecycle-v1]]

_Last updated: 2026-04-29_
