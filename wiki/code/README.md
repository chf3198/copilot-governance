# Wiki A — Code-Base Wiki (per-project)

Holds all code-base details for this repository. Per the Three-Wiki typology from research/three-wiki-typology-synthesis-1943.md.

## Purpose

Eliminate the G3 cost of dispersed CLI research when models or operators need to answer questions about the code base. Wiki A is the harness instantiation of the structural + semantic layers from #1858 R1 + R2.

## Subdirectories

- `symbols/` — Structural sub-layer. One page per source file, listing file + symbol + signature maps per the Aider repo-map pattern. Auto-updated from source code via Phase-1 child #2053.
- `concepts/` — Semantic sub-layer. Prose descriptions of how the code works (feature explainers, dependency graphs, known-issue notes).

## Scope

**Per-project** — content lives in this repository only. Never distributed to operator-global `~/.copilot/wiki/`.

## Auto-update

Populated by the auto-update pipeline (Phase-1 child #2055) on PR merge events. See research/three-wiki-typology-synthesis-1943.md §"Auto-update pipeline design (AC4)" for the 11-stage pipeline.

## Status

**Phase-1 stub** — created by #2051. Ingestion logic ships in #2053. Until then, this directory is empty except for this README.
