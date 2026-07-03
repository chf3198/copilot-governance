---
title: "Codebase Organization 2026-Q2"
type: source
created: 2026-05-02
updated: 2026-05-02
tags: [codebase, organization, governance, install-ergonomics]
sources: [raw/articles/codebase-organization-2026-05-02.md]
related: ["[[megingjord-harness]]", "[[fleet-architecture]]"]
status: draft
---

# Codebase Organization 2026-Q2

## Summary

Survey of 2026-Q2 best practices for organizing a multi-runtime, public-installable AI agent harness. Covers Node.js layout, polyglot patterns, Claude Code plugin conventions, secret/state separation, artifact isolation, repo configs, CI/CD, and documentation.

## Key findings

- `bin/` for entrypoints, `src/`/`lib/` for runtime code, `scripts/` for maintainer/CI utilities only.
- Plugin manifest only under `.claude-plugin/plugin.json`; peer dirs `agents/`, `skills/`, `commands/`, `hooks/`.
- `.env.example` committed, `.env*` gitignored; `.secrets.baseline` committed via detect-secrets.
- Universally gitignored artifacts: `dist/`, `build/`, `out/`, `coverage/`, `.cache/`, `node_modules/`.
- `.editorconfig` always; `mise.toml` preferred over `.tool-versions`; `.nvmrc` for CI compat.
- Reusable workflows + composite actions; group by event/purpose prefix.
- `AGENTS.md` + `CLAUDE.md` + `GEMINI.md` is the emerging cross-AI-tool root convention.

## Megingjord audit

Most surfaces match conventions. Gaps:

- `tickets/` (70 files) is non-standard.
- `package-lock.json` gitignored without ADR documentation.
- `.editorconfig` missing.
- `.secrets.baseline` missing.
- `model-compare/` and `NAMING_RESEARCH_2026.md` should relocate to `research/`.

## Implementation children spawned

- #820: relocate legacy research artifacts (`tickets/`, `model-compare/`, `NAMING_RESEARCH_2026.md`)
- #821: add `.editorconfig` + detect-secrets baseline
- #822: ADR-017 for `package-lock.json` commit-vs-gitignore decision

*Source: raw/articles/codebase-organization-2026-05-02.md*

See: [[megingjord-harness]], [[fleet-architecture]]
