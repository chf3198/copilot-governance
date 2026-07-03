---
title: Unified Token Telemetry Design (2026)
type: synthesis
created: 2026-05-01
updated: 2026-05-01
tags: [telemetry, governance, cost, tokens]
related: ["[[openclaw]]", "[[copilot-pro]]"]
status: active
confidence: high
sources_count: 8
last_verified: 2026-05-01
---

# Unified Token Telemetry Design (2026)

## Summary

Adopt a confidence-aware token ledger with provider adapters. Prioritize exact tracking for non-free and rate-limited lanes, while preserving estimated fallback for Copilot lanes where exact internal usage is not universally exposed.

## Design Decision

- Keep one normalized schema across all providers.
- Store both request-level and aggregate records.
- Require `confidence_level` on every record.
- Block rollout if non-free lanes lack mapped confidence.

## Canonical Record

`provider`, `model`, `timestamp`, `input_tokens`, `output_tokens`,
`cache_read_tokens`, `cache_write_tokens`, `reasoning_tokens`, `total_tokens`,
`cost_usd`, `confidence_level`, `request_id`, `source_kind`.

## Confidence Policy

- `exact_request`: direct request usage fields from provider response/events.
- `exact_aggregate`: provider usage reports with authoritative totals.
- `derived`: computed from trusted model/pricing metadata.
- `estimated`: approximation where exact fields are unavailable.
- `unknown`: prohibited for non-free lanes at release gate.

## Lane Prioritization

1. Anthropic, OpenRouter, Gemini, LiteLLM, Ollama adapters first.
2. Copilot adapter ships as estimated lane with explicit caveat labels.
3. Add reconciliation jobs comparing request totals vs aggregate reports.

## Governance Gates

- Non-free lane coverage gate: 100% mapped to non-unknown confidence.
- Drift gate: alert when derived/estimated share grows above threshold.
- Evidence gate: include provider matrix and reconciliation output per release.
