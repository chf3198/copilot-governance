---
title: Provider Cache Adapters & Sticky Routing
type: concept
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, wave4, caching, sticky-route, hit-rate]
related: ["[[hamr-v3-2-2026-05-04]]", "[[substrate-health]]", "[[header-spillover]]", "[[model-routing]]"]
status: shipped
---

# Provider Cache Adapters & Sticky Routing

## Purpose

Wave 4 child 3 (#926) extends the HAMR provider stack with native
caching opt-ins, cache-hit observability, and sticky tier-routing
that maximizes per-conversation cache hit rates per v3.2 §R5.

## Modules

- `scripts/global/litellm-client.js` — adds `cacheHeaders(provider)`
  emitting native cache hints per the v3.2 §R5 9-row matrix
  (Anthropic prompt-caching beta + extended-cache-ttl beta;
  Gemini `cachedContent`; Groq/Cerebras/OpenAI `x-cache-control`).
  **C9 (#1000)**: 5min default + 1h opt-in via `{ extendedTtl: true }`.
  Cost: 1h write 2.0× vs 5min 1.25×. Use extended only for high-hit
  workloads (wiki anneal, rule-coverage stage 2b).
- `scripts/global/token-provider-adapters.js` — adds 3 OAI-shape
  adapters (`openai`, `groq`, `cerebras`) so all 9 supported
  providers extract `cache_read_tokens`. Shared `oaiShape` helper
  keeps the file ≤ 100 lines. Anthropic/Gemini/OpenRouter already
  shipped in earlier waves.
- `scripts/global/cache-hit-gate.js` — NEW. Computes 7-day rolling
  hit rate from `~/.megingjord/cache-stats.jsonl`; alerts when
  `cache_read_tokens / input_tokens < 0.80` (v3.2 §R5 floor).
- `scripts/global/sticky-route.js` — NEW. Tier → preferred
  provider sequence, sticky to `previousProvider` when healthy,
  fallback via `~/.megingjord/substrate-health.json` (#911).

## Adapter coverage matrix (post-#926)

| Provider | Adapter | cache_read_tokens source |
|---|---|---|
| anthropic | `anthropic` | `usage.cache_read_input_tokens` |
| openai | `openai` | `usage.prompt_tokens_details.cached_tokens` |
| gemini | `gemini` | `usageMetadata.cachedContentTokenCount` |
| groq | `groq` | `usage.prompt_cache_hit_tokens` |
| cerebras | `cerebras` | `usage.prompt_cache_hit_tokens` |
| openrouter | `openrouter` | `usage.cached_tokens` or `prompt_tokens_details.cached_tokens` |
| litellm | `litellm` | derived (gateway aggregates) |
| ollama | `ollama` | n/a (local; no caching layer) |
| copilot | `copilot` | n/a (estimator lane) |

## Tier → provider map

```js
{
  free:    ['ollama', 'gemini', 'groq', 'cerebras'],
  fleet:   ['groq', 'cerebras', 'gemini', 'openrouter'],
  haiku:   ['anthropic', 'openrouter'],
  premium: ['anthropic', 'openai', 'openrouter'],
}
```

## Sticky-route flow

1. Router asks for tier (`free` | `fleet` | `haiku` | `premium`).
2. If `previousProvider` is in tier list AND healthy in
   substrate-health → return same provider (`sticky: true`).
3. Otherwise return first healthy candidate from tier list.
4. Returns `null` + `no_healthy_provider_for_tier_*` when all
   tier candidates are unhealthy.

## Cache-hit gate (cache-stats.jsonl)

```
{"ts": <epoch_ms>, "provider": "anthropic", "cache_read_tokens": 700, "input_tokens": 1000}
```

`runGate()` returns:

```json
{ "passed": true|false, "hit_rate": 0.0–1.0|null, "floor": 0.80,
  "sample_count": <int>, "cache_read_total": <int>, "input_total": <int>,
  "alert": null | "no_samples_in_window" | "hit_rate_<x>_below_floor_<y>" }
```

Exits non-zero when failing so CI can gate releases on hit rate.

## Related

- v3.2 §R5 (provider-native caching cost lever)
- v3.2 §R3 (capability matrix → tier mapping)
- substrate-health #911 (provider availability source)
- header-spillover #927 (rate-limit response)
- HAMR `/quota` schema v2 — feeds `cache-stats:hit-rate-7d` once a
  Worker-side cron writes the rolling hit rate from
  `cache-stats.jsonl` into KV (Wave 5 wiring).
