---
title: "Karpathy LLM Wiki Pattern"
type: concept
created: 2026-04-14
updated: 2026-04-14
tags: [architecture, knowledge]
sources: []
related: ["[[self-annealing]]", "[[copilot-pro]]"]
status: draft
---

# Karpathy LLM Wiki Pattern

Knowledge management pattern for LLM-curated wikis.

## Core Idea
LLMs are better at writing than retrieving. Instead of RAG,
have the LLM curate a structured wiki as it learns.

## 3-Layer Architecture
| Layer | Path | Owner |
|-------|------|-------|
| Raw sources | raw/ | Human curates |
| Wiki pages | wiki/ | LLM writes |
| Schema | WIKI.md | Co-owned |

## Page Types
- **Entity**: Person, device, service, tool
- **Concept**: Idea, pattern, technique
- **Source**: Digest of one raw source
- **Synthesis**: Cross-cutting analysis

## Operations
- **Ingest**: Raw → source page → entity/concept updates
- **Query**: Index → relevant pages → synthesized answer
- **Lint**: Structural health checks

See: [[karpathy-llm-wiki-pattern]], [[llm-wiki-state-2026]]
