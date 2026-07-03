# Wiki C scope=project — Project-specific Research-Based-Wisdom Wiki

Project-bound research knowledge that is NOT cross-project reusable. Per the Three-Wiki typology from research/three-wiki-typology-synthesis-1943.md, this is one of two scopes of Wiki C (the other being scope=global).

## Purpose

House research and synthesis output that is specific to THIS repository (Megingjord governance harness). Includes:
- Project-specific decisions (which validators we use, which paths are canonical)
- Project-bound architectural research (specific to our hooks, scripts, baton workflow)
- Phase-0 syntheses for research-first Epics that produce project-specific output

## Subdirectories

- `concepts/` — Project-specific concepts (definitions, terminology bound to this codebase)
- `decisions/` — Architectural Decision Records (ADRs) for project-scoped decisions
- `research/` — Phase-0 research syntheses for research-first Epics (e.g. `harness-state-isolation.md` for Epic #2091)

## Scope

**Per-project, COMMITTED** — content lives in this repository. **NEVER distributed to operator-global `~/.copilot/wiki/`.** This is the load-bearing distinction from Wiki C scope=global.

## Authoring path

- New research+planning synthesis lands here (NOT in legacy `research/*.md`) — this directory IS the home for the Phase-0 output of any research-first Epic where the deliverable is project-specific
- Cross-project wisdom (e.g. the branch-vs-worktree-vs-sandbox principle) belongs in `wiki/wisdom/global/` instead
- ADR-style decisions land in `decisions/`
- Long-form synthesis lands in `research/`

## Relation to GitHub issues

GitHub issue body + comments = canonical work record (process). This directory = curated knowledge (content). The two have distinct purposes; not duplicates.

## Status

**Phase-1 stub** — created by #2051. First consumer will be Epic #2091 Phase-0 child #2092 (harness state isolation synthesis) once unblocked.
