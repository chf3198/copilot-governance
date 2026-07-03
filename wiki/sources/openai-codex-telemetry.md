# OpenAI Codex Telemetry — Source Summary

**Ticket:** #1484 | **Date:** 2026-05-14

## Sources

### OpenAI API — Usage object
- Per-call: `prompt_tokens`, `completion_tokens`, `total_tokens`,
  `completion_tokens_details.reasoning_tokens` (o* models only).
- Reference: https://platform.openai.com/docs/api-reference/chat/object

### OpenAI Platform Usage Dashboard
- Org/project/user daily aggregates, JSON/CSV export.
- Lag: up to 24 h. Not a real-time API.
- Reference: https://platform.openai.com/usage

### OpenAI Codex CLI
- Agentic environment wrapping OpenAI API; no native structured
  per-task telemetry surface as of 2026-05.
- Token totals are visible only through the underlying API call `usage`.
- Reference: https://platform.openai.com/docs/codex

### Harness canonical telemetry schema
- `research/token-telemetry-capability-matrix-2026-05-01.md`
- `logs/cost-telemetry.jsonl`
- `logs/token-telemetry-summary.json`

## Key Limitations (confirmed as of 2026-05-14)
- No OpenAI native cache hit/write token fields (unlike Anthropic).
- No real-time `/cost` endpoint in API response.
- Codex CLI does not emit OTLP/OTel spans natively.

## Verdict
Codex telemetry is **viable** at `exact_request` confidence when routed
through `wrapProviderCall`. Session-level aggregation requires
platform export (~24 h lag). Suitable for daily/PR-level cost governance.
