---
title: "Ticket audit pass 2026-05-02"
type: source
created: 2026-05-02
updated: 2026-05-02
tags: [governance, audit, manager-authority, ticket-hygiene]
sources: [raw/articles/ticket-audit-2026-05-02.md]
related: ["[[ticket-audit-pattern]]", "[[baton-protocol]]", "[[governance-enforcement]]"]
status: draft
---

# Ticket audit pass 2026-05-02

## Summary

Manager-authority sweep of 18 open tickets. Deterministic governance scripts reported **zero drift**. LLM-grounded review surfaced one real documentation drift (#836), one ticket-cluster boundary issue (#732/#766/#833), and one AC-tightening signal on #829. Productization tracked in #837.

## Key signals

- **Documentation drift (real)**: `epic-governance.md` and `ticket-driven-work.md` give contradictory rules for `status:backlog` epics; resolved in code, not in docs.
- **LLM false positives (dismissed)**: model misread the contradictory rules and emitted spurious "missing role:manager" findings against the deterministic ground truth.
- **Token cost (real evidence)**: ~8 KB Claude tokens for the entire audit; ~80 KB free fleet/cloud tokens did the work.

## Outcomes

- New tickets: #836 (doc reconciliation), #837 (productize as `npm run governance:audit`).
- Manager comments posted: #732, #766, #829, #833.
- Wiki concept page created: `[[ticket-audit-pattern]]`.

*Source: raw/articles/ticket-audit-2026-05-02.md*

See: [[ticket-audit-pattern]], [[baton-protocol]], [[governance-enforcement]]
