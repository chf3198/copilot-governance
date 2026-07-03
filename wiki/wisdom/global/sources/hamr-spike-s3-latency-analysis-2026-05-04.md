---
title: "HAMR Spike S3 — Substrate Latency Analysis 2026-05-04"
type: source
created: 2026-05-04
updated: 2026-05-04
tags: [hamr, latency, cloudflare, workers, r2, tailscale, substrate, performance]
sources: [raw/articles/hamr-spike-s3-latency-analysis-2026-05-04.md]
related: ["[[hamr-v3-2026-05-04]]", "[[hamr-spike-s1-code-audit-2026-05-04]]", "[[cf-worker-latency]]", "[[tailscale-fleet-rtt]]"]
status: draft
---

# HAMR Spike S3 — Substrate Latency Analysis 2026-05-04

## Summary

Measurement-grounded latency analysis for the HAMR v3 (#873) substrate overhead
claim of ≤80 ms per call. Deliverable for spike #878, gating MVP execution under
EPIC #860.

Lane revised from code-change to docs-research after S2 (#877) confirmed no
Wrangler 4.x and no R2 bucket in the operator environment.

**Verdict: REVISE.** The ≤80 ms claim holds only for warm-connection cache-hit
paths (p50 = 54 ms, p95 = 80 ms). Cold first-call paths exceed the budget by
28–36 ms at p50 and 76–96 ms at p95.

## Key findings

- **CF Worker TTFB measured at 105.9 ms p50** (10-sample probe of
  `1.1.1.1/cdn-cgi/trace`, a Workers-fronted CF endpoint). First-call cold path
  includes TLS full-handshake; warm-path HTTP/2 reuse brings this to ~53 ms.
- **DNS resolution: 1.6 ms p50** (30 samples to api.cloudflare.com). Negligible.
- **Per-path budget:**

  | Path | p50 (ms) | p95 (ms) | vs. ≤80 ms |
  |---|---|---|---|
  | Cold, cache-miss | 116.5 | 176.0 | EXCEEDS +36 ms |
  | Cold, cache-hit | 108.5 | 156.0 | EXCEEDS +28 ms |
  | Warm, cache-miss | 62.0 | 100.0 | WITHIN / EXCEEDS p95 |
  | Warm, cache-hit | 54.0 | 80.0 | WITHIN / AT LIMIT p95 |

- **Tailscale fleet RTTs measured:** LAN peers 5–11 ms p50 (within claim);
  WAN relay (penguin-1) 64 ms p50, 170 ms p95 — adds significant overhead
  to fleet-path latency.
- **Published vendor numbers sourced from:** Cloudflare Workers limits,
  Cloudflare R2 docs, Groq rate limits, Cerebras inference docs, OpenRouter
  API docs, Google Gemini API docs, Anthropic caching docs, Tailscale KB.
  8 vendor sources total.

## Required revisions to HAMR v3

1. Scope claim: "≤80 ms warm-connection cache-hit p95 substrate overhead."
2. Add HTTP/2 keepalive requirement to HAMR core Worker client.
3. Add KV edge-cache mandate (Cache-Control headers on bundle response).
4. Revise `npx megingjord init` sample output: "bundle: fetched 60 ms" is
   45 ms optimistic vs. measured 108–116 ms cold; qualify as best-case.

## Gaps in published vendor numbers

- **R2 latency:** No formal SLA; 5–15 ms estimate from CF documentation.
- **Anthropic TTFT:** No official p50/p95 published. Community-measured only.
- **Cerebras TTFT:** No official latency figure published.
- **OpenRouter proxy overhead:** No official figure; community-estimated 50–200 ms.
- **Warm-path RTT:** Derived (TTFB/2 heuristic), not directly measured.
  Live-deploy plan in §9 of primary source would close this gap.

## Wiki ingest plan

- raw/articles/hamr-spike-s3-latency-analysis-2026-05-04.md (digest source)
- entity candidates: [[cf-worker-latency]] (new), [[tailscale-fleet-rtt]] (new)
- concept candidates: [[hamr-substrate-overhead]] (new),
  [[warm-connection-assumption]] (new)

## Citations

Primary source: `research/hamr-spike-s3-latency-analysis-2026-05-04.md`
(this PR, issue #878). Measurements collected 2026-05-05 03:34–03:36 UTC.
Comparison baseline: `research/hamr-v3-2026-05-04.md` (#873).
