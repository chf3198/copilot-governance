---
title: "Manager-side ticket audit pattern"
type: concept
created: 2026-05-02
updated: 2026-05-02
tags: [governance, audit, free-fleet, manager-authority, baton]
sources: ["[[ticket-audit-2026-05-02]]"]
related: ["[[baton-protocol]]", "[[governance-enforcement]]", "[[ticket-lifecycle-v1]]", "[[cascade-dispatch]]", "[[free-router]]"]
status: draft
---

# Manager-side ticket audit pattern

A Manager-authority audit pass that grades open tickets for governance drift, redundancy, scope quality, and label hygiene **without** consuming Claude Code tokens for the heavy lifting.

## Layered approach

1. **Deterministic pre-checks (no tokens).** Run `npm run governance:drift|verify|reconcile|epics`. These encode ADR-005/008/010 in code and produce ground truth.
2. **LLM-grounded per-ticket review (free fleet).** For each ticket, build a context bundle with the binding instruction files (`ticket-driven-work`, `role-baton-routing`, `epic-governance`) + the ticket body and labels. Dispatch in parallel across Groq llama-3.3-70b and Cerebras qwen-3-235b (free, fast). Throttle to per-minute caps.
3. **Reconciliation pass (small high-quality model).** Optional final cross-ticket pass on `qwen2.5-coder:32b` at 36gbwinresource for redundancy detection across tickets.
4. **Manager-only remediation.** Apply label flips, ticket creation, scoping comments, closures via `gh` CLI. No code, no PRs.

## Token budget

Roughly **5–10 KB Claude tokens** for the entire pass when the audit script aggregates inside Node and emits a single short summary. Compare to **80–120 KB free fleet/cloud tokens** doing the actual work.

## False-positive guard

LLMs reading the project rules may produce critique that contradicts the deterministic checker's ground truth. Treat LLM findings as **hints to investigate**, not as authoritative violations. Always reconcile against `governance:drift` output.

## When to use

- Weekly grooming sweep.
- Before declaring an epic ready for closeout (independent critique).
- After major instruction-file edits (catches documentation drift).

## See also

- `[[baton-protocol]]` — the underlying lifecycle this audit grades against
- `[[governance-enforcement]]` — the deterministic side
- `[[free-router]]` — LLM tier selection for the LLM legs
