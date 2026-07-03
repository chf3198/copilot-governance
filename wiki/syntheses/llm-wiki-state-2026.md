---
title: LLM Wiki Critical Analysis & 2026 Best Practices
type: synthesis
created: 2026-04-30
updated: 2026-04-30
tags: [wiki, knowledge-management, karpathy, architecture, research]
related: ["[[wiki-pattern]]", "[[karpathy-llm-wiki-pattern]]", "[[llm-wiki-implementation-plan]]"]
status: active
confidence: high
sources_count: 16
last_verified: 2026-04-30
---

# LLM Wiki Critical Analysis & 2026 Best Practices

## Summary

Web-sourced synthesis (2026-04-30, 16 sources) against the 2026 landscape.
Verdict: flat-markdown architecture validated at 65-page scale. Five additive
improvements identified — no architectural replacement warranted.

## Architecture Decision: Keep Flat-Markdown

Letta benchmark: filesystem approach 74.0% on LoCoMo vs Mem0 graph 68.5%.
Anthropic: just-in-time loading (index → targeted pages) is the recommended pattern.
GraphRAG/Mem0/Pinecone/Letta: all overkill or wrong-fit until 500+ pages.

## Community v2 Additions (April 2026)

`rohitg00` v2 gist production findings: adopt confidence scoring + supersession
tracking (frontmatter only, low cost). Defer `relationships.json` until >150 pages.
Typed wikilinks via `@` suffix is medium-cost naming convention for future use.

## Deficiencies Found (2026-04-30 Audit — all fixed)

- 34 lint violations: 13 orphans, 18 missing frontmatter, 2 index gaps, 1 broken link
- 3 ghost index entries (linting-governance-rationale/tooling/rollout) — removed
- `type: concepts/sources/syntheses` plural errors on 7 pages — corrected
- `wiki_router.py` had no `infra-automation` branch — devenv-ops unrouted

## 5 Improvement Recommendations

**P0 — Done**: Confidence/freshness frontmatter (`confidence`, `last_verified`,
`sources_count`, `superseded_by`) added to `WIKI.md` schema.

**P0 — Done**: `wiki_router.py` infra-automation routing: inject fleet routing order
and governance enforcement layers for devenv-ops sessions. Max snippets raised to 5.

**P1**: `qmd` local hybrid-search MCP — SQLite FTS5/BM25 + GGUF embeddings + Qwen3
reranker. No API keys. `npm install -g @tobilu/qmd`. Covers ~20% of ambiguous queries.

**P1**: Typed wikilink annotations — `@supersedes`, `@contradicts`, `@implements`,
`@supports` suffix convention. Naming only, no tooling needed.

**P2**: Pre-session frontmatter-only map injection: `index.md` + all frontmatters
(~8-15K tokens). Rich navigation without full page loads at session start.

## What NOT to Do

- No vector embeddings until ~500 pages; no `relationships.json` until >150 pages
- No consolidation tiers (over-engineered); no Obsidian lock-in (optional only)

## See Also

- [[wiki-pattern]] — core Karpathy concept
- [[llm-wiki-implementation-plan]] — prior plan (Apr 2026)
- [[karpathy-llm-wiki-pattern]] — source digest
- [[governance-enforcement]] — wired into session injection
