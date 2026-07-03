---
name: Sandbox Worktree Governance
description: Governance controls for multi-agent sandbox worktrees used by Copilot, Claude Code, Codex, Cursor, and Antigravity.
applyTo: "**"
---

# Sandbox Worktree Governance

## Operating Model

- `sandbox/copilot`, `sandbox/codex`, `sandbox/claude-code`, `sandbox/cursor`, and `sandbox/antigravity` are launcher branches.
- Launcher branches are not delivery branches.
- Delivery work must happen on ticket-linked task branches (`feat/<issue#>-<slug>`, `fix/<issue#>-<slug>`, `hotfix/<issue#>-<slug>`).
- Per-runtime governance injection differs: Antigravity uses the User Rules system-prompt block plus Knowledge Items (KI) — the `@`-import mechanism is not supported; Cursor uses `.cursor/rules/*.mdc`; Claude Code uses `@`-imports in `CLAUDE.md`.

## Required Session Start

Before starting implementation in any sandbox worktree:

1. `git fetch origin --prune`
2. Reset launcher branch to `origin/main`
3. Remove local residue (`git clean -fd`)
4. Create and switch to ticket-linked task branch
5. Create or refresh a cross-team lease for the ticket and intended paths

Preferred command:

- `bash scripts/worktree-session-start.sh <copilot|codex|claude-code|cursor|antigravity> feat/<issue#>-<slug>`

Lease command:

- `node scripts/global/cross-team-lease.js create --ticket <N> --team <team> --role collaborator --branch <branch> --paths <paths> --runtime-surfaces <surfaces> --post-comment 1`

Conflict check:

- `node scripts/global/cross-team-conflict-gate.js --ticket <N> --branch <branch> --paths <paths> --post-comment 1`

## Forbidden Actions

- Do not commit directly on `sandbox/*` branches.
- Do not open PRs from `sandbox/*` branches.
- Do not keep launcher branches behind `origin/main` between sessions.
- Do not edit files before the ticket has a live `CROSS_TEAM_LEASE_CREATE`
  comment unless the work is issue-only research.

## Verification Gates

- Local: pre-commit branch guard blocks commits on `sandbox/*`.
- CI: `worktree-governance-required` must pass.
- Audit command: `npm run governance:worktrees`.
- Targeted audit: `node scripts/global/worktree-governance-audit.js --target=codex --json`.
- Default audits must still check all Copilot, Claude Code, and Codex launchers.
- Cleanup plan: `node scripts/global/worktree-cleanup-plan.js --json`.
- Lifecycle diagnosis (#2252): `node scripts/global/worktree-lifecycle-gate.js --session-diagnosis`.
- Baton worktree fields (lane:code-change): `worktree_branch`, `worktree_behind_main`, `worktree_cleanup`, `worktree_residual_risk`.
- VS Code active workspace: `node scripts/global/worktree-cleanup-plan.js --workspace .dashboard/active-worktrees.code-workspace`.

## Escalation

If any sandbox branch is behind or dirty: stop, run session-start reset flow, then resume on a ticket-linked task branch only.

If Source Control is cluttered: generate the cleanup plan, remove only
`merged-clean` worktrees, and preserve dirty or unpushed work through rescue
branches or draft PRs before any deletion.

## Cross-Team Lease Lifecycle

- Live lease state is repo-local runtime state in `.dashboard/cross-team-leases.json`.
- Schema lives in `inventory/cross-team-lease.schema.json`.
- Leases record ticket, team, role, branch, worktree, paths, ports, runtime
  surfaces, timestamps, expiry, and status.
- `create` claims a ticket/branch before edits.
- `refresh` heartbeats long-running work.
- `expire` marks stale claims for cleanup.
- `close` releases ownership after merge, cancellation, or handoff.
- Creation and closeout should be mirrored to the GitHub issue with the stable
  `CROSS_TEAM_LEASE_*` marker block.
- Before edits, run the conflict gate for intended paths. Exact branch and
  same-ticket path collisions block unless Manager override is present; adjacent
  governance surfaces warn and should be coordinated in the issue thread.
