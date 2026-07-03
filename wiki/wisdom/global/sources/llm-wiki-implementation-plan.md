---
title: "LLM Wiki Optimal Implementation Plan"
type: source
created: 2026-04-23
updated: 2026-04-23
tags: [wiki, architecture, context-engineering, memory, implementation]
sources: [raw/articles/llm-wiki-optimal-implementation-plan.md]
related: ["[[wiki-pattern]]", "[[karpathy-llm-wiki-pattern]]", "[[governance-enforcement]]", "[[protocol-enforcement]]", "[[self-annealing]]"]
status: final
---

# LLM Wiki Optimal Implementation Plan

## Summary

Research synthesis (Apr 2026) from Anthropic Claude Code Best Practices,
Mem0 April 2026 memory algorithm, Lilian Weng agent taxonomy, and Karpathy
"context engineering" defining the optimal implementation path for the
devenv-ops Karpathy LLM Wiki. The wiki is already wired into SessionStart
via `wiki_wisdom.py` — only 3 of 50 pages are active. Five gaps identified
with a tiered remediation plan.

## Key Findings

### Context Engineering Frame
Karpathy + Tobi Lutke (Jun 2025): the wiki's purpose is **context fuel**, not
documentation. Every page exists to be injected at the right moment.
Anthropic: CLAUDE.md must be short; wiki pages + skills carry domain knowledge.

### Current Architecture Assessment
- `wiki_wisdom.py` is wired: reads wiki pages, injects 3 into every session
- `index.md` is the manual BM25 retrieval catalog — correct pattern
- `log.md` is append-only — correct pattern (Mem0 ADD-only algorithm)
- wikilinks (double-bracket syntax) = manual entity linking — correct pattern

### Five Gaps
1. Only 3 of 50 wiki pages wired into session_context.py
2. No task-adaptive routing — same pages injected regardless of task
3. Post-work ingest never happens (log stale since Apr 21, 2026)
4. Only 2 syntheses from 50 pages — reflection mechanism underused
5. Index drift — index.md stale relative to actual file system

## Remediation Plan (Tiered)

### P0 — Immediate (30 min total)
- SessionStart: inject `index.md` catalog for devenv-ops sessions
- wiki_wisdom.py: add `wiki_pattern()` function, inject when in devenv-ops
  → agent is reminded every session to write wiki after significant work

### P1 — Short-term (2 hrs total)
- Expand wiki_wisdom.py with `dashboard_gold_rules()`, `ticket_lifecycle()`,
  `self_annealing()`, `fleet_topology()` functions
- Add signal→page routing: "dashboard-edit" → inject gold rules, etc.
- Add "Wiki Updates" section to handoff doc template
- Stop hook: emit wiki-pending reminder if significant work detected

### P2 — Advanced (when P0+P1 stable)
- `wiki_router.py`: keyword extraction from first prompt → top-3 page match
- Synthesis trigger: if 3+ concept pages referenced, suggest synthesis creation
- Auto-index update in `npm run wiki:anneal`

## What NOT to Do
- No vector embeddings/RAG — file read + index.md grep outperforms at <200 pages
- No blocking wiki writes mid-session — Stop hook reminders only
- No wiki content hardcoded in CLAUDE.md/instructions — use wiki_wisdom.py
- No session conversation indexing — curated knowledge only

## Related Concepts
- [[wiki-pattern]] — Core Karpathy LLM Wiki concept
- Karpathy LLM Wiki source digest — community implementation summary
- [[governance-enforcement]] — Currently wired via wiki_wisdom.py
- [[self-annealing]] — Post-session review that should trigger wiki writes
