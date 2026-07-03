# Multi-Agent Dashboard Design — Epic #742
Date: 2026-05-01 | Lane: docs-research | Parent: #742 | Depends-on: #736 (DONE)

## Research Questions & Decisions

### Q1: Layout for N parallel agent lanes (3–6 agents)
**Decision: CSS Grid `auto-fill` columns.**
Extends existing `baton.css` grid language without accordion JS complexity.
`grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))` naturally
wraps at any viewport width, needs zero JS to switch between 2-lane and
6-lane views, and matches the existing dashboard grid primitive in `views.css`.
Accordion was rejected: adds interaction overhead and hides agents that are
actively running — operators need all active lanes visible at a glance.

### Q2: UX pattern when N > 3 agents active simultaneously
**Decision: Priority-first visible with overflow count badge.**
Show the first 3 agents sorted by priority (A > B > C), render a `+N more`
badge for hidden agents. Clicking the badge expands a collapsed list.
This keeps the primary viewport clean while still surfacing "how many are
running". Pagination was rejected: it breaks the ambient-awareness pattern
(users can't see at a glance that something changed on page 2).

### Q3: Status-bar widget approach
**Decision: Browser-tab-only dashboard — no VS Code extension required.**
The harness is install-agnostic and cross-platform. Shipping a VS Code
extension adds manifest maintenance, VSIX publishing, and per-version
compat overhead. The statusBarItem API requires extension host activation
which breaks in remote-SSH and devcontainer sessions. The dashboard browser
tab already serves as the live command surface; a browser favicon badge
(window.document.title prefix with agent count) achieves the ambient
indicator without any extension dependency.

### Q4: SSE event prefix schema
**Decision: Namespaced JSON-line per agent heartbeat.**
```json
{
  "vendor": "copilot",
  "agentId": "copilot-feat-742",
  "branch": "feat/742-multi-agent-dashboard",
  "ticket": "742",
  "activity": "implementing multi-agent-sessions.js",
  "ts": 1746057600,
  "tier": "A"
}
```
Each line in `.dashboard/agent-heartbeats/<agentId>.jsonl` is one record.
The `vendor` field partitions streams; `tier` drives banner logic (Tier-C
triggers limited-mode warning). The dashboard SSE reader multiplexes all
files into a single sorted view by `ts`.

## Implementation Plan (spawned as children of #742)
- #775 — multi-agent-sessions.js + CSS grid layout
- #776 — tier-c-banner.js + conflict-alert.js
- #777 — HTML/app.js wiring + nav tab

## Acceptance Criteria Mapping
- [x] Layout decision: CSS Grid (Q1)
- [x] N>3 pattern: overflow badge (Q2)
- [x] Status-bar: browser-tab-only (Q3)
- [x] SSE schema: defined (Q4)
- [ ] Implementation children spawned (see #775–#777)

## Team&Model
- Human alias: curtisfranks
- Team&Model: GitHub Copilot + Claude Sonnet 4.6 (Cerebras llama3.1-8b for design Q&A)
- Date: 2026-05-01
