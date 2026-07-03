# WIKI.md — LLM Wiki Schema

> The LLM reads this file to understand how the wiki works.
> Co-evolved by human and LLM as conventions mature.

## Document Suite

This file is the entry point. Detailed companion docs cover each major area:

| Companion                                          | Content                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [wiki/WIKI.md](wiki/WIKI.md)                       | Full schema: three-wiki typology, page types, frontmatter spec, naming conventions, cross-reference rules, constraints |
| [wiki/WIKI-operations.md](wiki/WIKI-operations.md) | Procedures: ingest, query, lint, anneal, content trust scoring, versioning                                             |
| [wiki/WIKI-typology.md](wiki/WIKI-typology.md)     | Three-wiki type details, namespace isolation, fleet routing, special pages                                             |

## Architecture (3 layers)

| Layer       | Path      | Owner         | Mutability                |
| ----------- | --------- | ------------- | ------------------------- |
| Raw sources | `raw/`    | Human curates | Immutable after placement |
| Wiki        | `wiki/`   | LLM writes    | LLM updates freely        |
| Schema      | `WIKI.md` | Co-owned      | Changed by agreement      |

## Three-Wiki Typology

| Wiki     | Path             | Purpose                                                 |
| -------- | ---------------- | ------------------------------------------------------- |
| Code     | `wiki/code/`     | Source code semantics — symbols, concepts, dependencies |
| Work-Log | `wiki/work-log/` | Ticket and PR mirrors — status, history                 |
| Wisdom   | `wiki/wisdom/`   | Research knowledge — entities, concepts, syntheses      |

### Backfill / population (#3065)

Wiki A is populated by `npm run wiki:ingest:code` (scripts → `wiki/code/symbols/`, instructions →
`wiki/code/concepts/`); Wiki B by `node scripts/wiki/backfill-work-log.js` (OPEN + last-90d-closed
issues → `tickets/`, merged PRs → `prs/`, `log-redaction` on bodies + validate-at-write). Both
carry provenance frontmatter and are derived mirrors — edit the source, not the page. The generated
trees are excluded from `lint:md` (governed by `wiki:lint`) and the 100-line cap.

## Page Types (Wisdom wiki)

| Type           | Directory                       | Purpose                             |
| -------------- | ------------------------------- | ----------------------------------- |
| Entity         | `wiki/wisdom/global/entities/`  | Person, device, service, tool       |
| Concept        | `wiki/wisdom/global/concepts/`  | Idea, pattern, technique, decision  |
| Source summary | `wiki/wisdom/global/sources/`   | Digest of one raw source            |
| Synthesis      | `wiki/wisdom/global/syntheses/` | Cross-cutting analysis, comparisons |

## Frontmatter (required on every page)

```yaml
---
title: 'Page Title'
wiki_type: code | work-log | wisdom
content_hash: sha256-of-content
last_updated: 2026-06-08
freshness_window: 7d | 14d | 30d | none
content_trust_score: 0.0–1.0
status: stub | draft | mature
---
```

Wisdom pages also require `scope: project | global`.
Code and work-log pages require `source_path` and `source_sha256`.

## Commands

| Operation | Command                                         |
| --------- | ----------------------------------------------- |
| Ingest    | `npm run wiki:ingest -- raw/articles/<file>.md` |
| Search    | `npm run wiki:search -- "query"`                |
| Lint      | `npm run wiki:lint`                             |
| Anneal    | `npm run wiki:anneal`                           |

`wiki:search` is exposed globally at `node ~/.copilot/scripts/wiki-search.js`
after deploy. See [wiki/WIKI-operations.md](wiki/WIKI-operations.md) for the
full operational runbook.

## Special Files

| File            | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `wiki/index.md` | Catalog of every page, grouped by type. Updated on every ingest. |
| `wiki/log.md`   | Append-only chronological record of all operations.              |

## Naming Conventions

- Filenames: `kebab-case.md` (e.g., `penguin-1.md`, `llm-wiki-pattern.md`)
- Wikilinks: `[[page-name]]` — no path prefix, no extension
- One concept per page; split pages that exceed 80 lines of content

## Constraints

Wiki files are `≤100 lines` (lint-enforced for files outside `wiki/wisdom/`,
`wiki/code/`, and `wiki/work-log/`). Apply the split-and-link pattern:
see [docs/howto/100-line-design-contract.md](docs/howto/100-line-design-contract.md).
