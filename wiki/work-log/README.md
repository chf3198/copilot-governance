# Wiki B — Project Work-Log Wiki (per-project)

Local mirror of GitHub ticket and PR history for this repository. Per the Three-Wiki typology from research/three-wiki-typology-synthesis-1943.md.

## Purpose

Reduce `gh issue view` / `gh pr view` round-trip cost (G3) and enable outage-time queries (G7). Wiki B is the harness instantiation of Copilot's scoped memory layer (#1858 R4) at the project tier.

## Subdirectories

- `tickets/` — One page per GitHub issue. Mirror of `gh issue view N --json comments,labels,state`. Includes baton artifacts, AC tracking, status transitions.
- `prs/` — One page per pull request. Mirror of `gh pr view N --json reviews,checks,state`.

## Scope

**Per-project** — content lives in this repository only. Never distributed to operator-global `~/.copilot/wiki/`.

## Auto-update

Populated by ingestion logic in Phase-1 child #2054 on GitHub webhook events (issue + PR open/edit/close). See research/three-wiki-typology-synthesis-1943.md §"Auto-update pipeline" for the contract.

## Relation to GitHub issues

GitHub issues remain the **canonical remote work record**. Wiki B is a DERIVED mirror, refreshed by automation. Editing Wiki B directly is incorrect; edit the GitHub issue and let the mirror refresh.

## Status

**Phase-1 stub** — created by #2051. Ingestion logic ships in #2054. Until then, this directory is empty except for this README.
