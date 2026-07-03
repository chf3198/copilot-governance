---
title: Cross-Team R&D Synthesis (v3)
type: concept
created: 2026-05-30
updated: 2026-05-30
tags: [governance, cross-team, synthesis, baton]
related: ["[[megingjord-harness]]", "[[baton-protocol]]", "[[harness-goals]]"]
status: stable
---

# Cross-Team R&D Synthesis (v3)

Canonical pattern for multi-team R&D synthesis when an Epic's scope warrants independent perspectives from 3+ AI agent orchestrator teams (Claude Code, Codex, Copilot, Antigravity).

## Why

Single-team R&D misses findings that another team would surface. Empirical: #1105 (3-team prototype, 2026-05-08) had each team independently surface decisions the others missed; 6.5h to unanimous convergence on 11 decisions.

## Mechanics

Lead-team baton ownership (one team owns Agile baton; others participate as collaborators); iterative debate waves with K-S adaptive termination; admin role rotates per `teams[ticket_N % len(teams)]`.

## Surfaces

- Canonical protocol: `instructions/cross-team-rd-synthesis.instructions.md`
- Scaffolding: `npm run synthesis:init -- --epic <N>`
- Snapshots: `.github/workflows/cross-team-rd-snapshot.yml` (6h cron)
- Status check: `npm run synthesis:status -- --epic <N>`
- How-to walkthrough: `docs/howto/cross-team-rd-synthesis.md`

## Tier-graceful

Tier-1 by default (GitHub-only); HAMR R2 mailbox is Tier-2 optimization per `[[tier-graceful-degradation]]`.

## See also

- [[harness-goals]] §Tier-graceful degradation
- [[baton-protocol]]
- Epic #1112 productization parent
