---
title: "Sandbox Worktree Governance Pack (2026-04-29)"
type: source
created: 2026-04-29
updated: 2026-04-29
tags: [governance, git-worktree, sandbox, branch-drift]
sources:
  - research/sandbox-worktree-governance-pack-2026-04-29.md
  - https://git-scm.com/docs/git-worktree
  - https://git-scm.com/docs/githooks
  - https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#merge_group
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
  - https://code.visualstudio.com/docs/sourcecontrol/branches-worktrees
related: ["[[governance-enforcement]]", "[[ticket-lifecycle-v1]]", "[[self-annealing]]"]
status: draft
---

# Sandbox Worktree Governance Pack (2026-04-29)

## Summary

- Sandbox branches are launcher-only branches, not delivery branches.
- Local and CI controls are both required to prevent branch-role drift.
- Merge-group compatibility must be preserved for queue-safe governance.

## Captured Controls

1. Session start reset command for sandbox launchers.
2. Commit-time block on direct `sandbox/*` commits.
3. Executable worktree governance audit in CI and local workflows.

## Linked Local Assets

- `scripts/worktree-session-start.sh`
- `scripts/global/worktree-governance-audit.js`
- `instructions/sandbox-worktree-governance.instructions.md`
- `research/concurrent-agent-worktrees-2026-04-24.md`

Last updated: 2026-04-29
