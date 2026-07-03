---
title: Header-Spillover & Anthropic Batch Routing
type: concept
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, wave4, spillover, batch, rate-limiting, slsa]
related: ["[[hamr-v3-2-2026-05-04]]", "[[hamr-v3-2-1-2026-05-05]]", "[[substrate-health]]", "[[release-pipeline]]"]
status: shipped
---

# Header-Spillover & Anthropic Batch Routing

## Purpose

Wave 4 child 9 (#927) wires three previously-stub HAMR surfaces:

1. **Header-driven provider spillover** — read provider rate-limit
   headers + `~/.megingjord/substrate-health.json` to pick the next
   provider on `429` or `x-ratelimit-remaining-requests: 0`.
2. **Anthropic Batch routing** — opt-in non-time-critical work
   (wiki anneal, research summaries, rule-coverage Stage-2b,
   bundle rebuild) into the Batch API for 50% off + bypassed
   online quotas (24h SLA, 100k requests/batch ceiling).
3. **HAMR `/mcp` SLSA gate** — `x-hamr-bundle-sha` header is
   validated against KV-resident `slsa-attest:<sha>` markers
   populated by the SLSA pipeline (#912); missing or unverified
   markers return `503 slsa_gate_failed`.
4. **HAMR `/quota` real data** — `schema_version: 2`, reads
   `cache-stats:hit-rate-7d` (populated by Wave 4 child 3 #926
   adapters once shipped) + per-provider spillover state under
   `provider-spillover:<name>`.

## Modules

- `scripts/global/header-spillover.js` — pure function library:
  `readRateLimitHeaders`, `pickSpilloverTarget`, `maybeSpillover`,
  `readSubstrateHealth`, `PROVIDER_PRIORITY`.
- `scripts/global/anthropic-batch-router.js` — `submitBatch`,
  `pollBatch`, `isBatchEligible`. Defaults: 30s poll, 24h max wait.
- `cloudflare/hamr/routes/mcp.ts` — replaces Wave 2 #910 503
  placeholder with Ed25519 DPoP verify + bundle-SHA SLSA gate.
- `cloudflare/hamr/routes/quota.ts` — replaces Wave 2 placeholder
  with KV-backed cache-stats + provider-spillover state.

## Spillover priority

`['anthropic', 'openai', 'cerebras', 'groq', 'gemini', 'openrouter']`

`pickSpilloverTarget(current, opts)` skips the rate-limited current
provider and returns the first candidate whose substrate-health
`available !== false && !rate_limited`. Returns `null` +
`reason: 'no_available_alternative'` when none remain.

## Rate-limit detection

`readRateLimitHeaders(resp)` is provider-agnostic; it accepts a
`Response`, a `Map`, or a plain headers object:

- HTTP `429` ⇒ `rate_limited: true`.
- `x-ratelimit-remaining-requests: 0` ⇒ `rate_limited: true`.
- `retry-after` (seconds or epoch) ⇒ `retry_after_ms` + `reset_at`.

## Batch eligibility

`isBatchEligible({ kind, deadlineMs })` returns `eligible: true`
only when `kind ∈ {wiki-anneal, research-summary,
rule-coverage-stage2b, bundle-rebuild}` AND `deadlineMs ≥ 6h`.

## SLSA gate flow

1. Caller signs canonical bytes with operator Ed25519 key
   (`baton-signing.js` #894).
2. Caller sends `Authorization: DPoP …`, `x-hamr-key-id`,
   `x-hamr-signature`, `x-hamr-canonical`, optional
   `x-hamr-bundle-sha`.
3. Worker verifies signature against `PUBLISHER_KEYRING`.
4. If `x-hamr-bundle-sha` present: KV lookup
   `slsa-attest:<sha>`; missing or `verified !== true` ⇒ 503.
5. Otherwise: `200 { accepted: true, slsa_gate: 'verified'
   | 'skipped_no_bundle_advertised' }`.

## Quota schema v2

```json
{
  "schema_version": 2,
  "ts": <epoch_ms>,
  "hit_rate_7d": <float|null>,
  "providers": { "<name>": { "rate_limited": <bool>, "reset_at": <epoch_ms|null> } },
  "placeholder": false
}
```

## Related

- v3.2 §R3 (HAMR /mcp DPoP + SLSA gate)
- v3.2 §R5 + v3.2.1 (Batch API for time-elastic work)
- v3.2.1 §R9.2 (cwd-vs-branch hook contract — observed during this child)
- substrate-health #911 (provider availability source)
- release-pipeline #912 (`slsa-attest:<sha>` writer)
