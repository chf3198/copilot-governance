---
title: "HAMR Wave 1 S3 Live Deploy 2026-05-05"
type: source
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, wave1, latency, cloudflare, kv, live-measurement, validation]
sources: [raw/articles/hamr-wave1-s3-live-deploy-2026-05-05.md]
related: ["[[hamr-v3-2-2026-05-04]]", "[[hamr-spike-s3-latency-analysis-2026-05-04]]", "[[hamr-doctor]]"]
status: draft
---

# HAMR Wave 1 S3 Live Deploy 2026-05-05

## Summary

Closes the warm-path RTT validity gap from S3 analytical spike
(#878). Throwaway CF Worker + KV deployed at
`hamr-spike.chf3198.workers.dev`; 60 measurement samples taken;
infrastructure torn down (verified 404).

R2 substituted with KV because R2 requires one-time operator
dashboard ToS acceptance (cannot automate). Same Workers-Paid
plan, same bound-storage round-trip, same latency variable.

## Measured

- **Cold** (n=30, new TLS per call): p50 114.6 ms / p95 153.3 ms.
  Within v3.2 §R4 ≤180 ms cold-p95 budget.
- **Warm** (n=29, HTTP keep-alive): p50 37.4 ms / p95 45.4 ms.
  **Beats v3.2 §R4 ≤80 ms warm-p50 / ≤120 ms warm-p95 by ~2×.**

## Decisions

- **CONFIRM v3.2 §R4 latency budget** — no thresholds revised.
- **Revise `npx megingjord init` sample to 40 ms p50 / 50 ms p95.**
- **HTTP/2 keepalive + KV edge-cache mandates ratified** by 3.1×
  cold-vs-warm ratio.
- **R2 enablement deferred to operator dashboard step**; add to
  `hamr:doctor` remediation list (#896) as manual link.

## Threats to validity

- Single operator geography.
- KV vs R2 (KV ~5–15 ms faster; warm-path margin absorbs the
  difference).
- 103-byte test bundle vs real 30 KB HAMR bundle (transfer-time
  delta immaterial on broadband).

## Citations

Primary source: `research/hamr-wave1-s3-live-deploy-2026-05-05.md`
(this PR, issue #891). Comparison baseline:
`research/hamr-spike-s3-latency-analysis-2026-05-04.md` (#878).
HAMR v3.2 §R4 input contract:
`research/hamr-v3-2-2026-05-04.md` (#890). CF Workers docs:
<https://developers.cloudflare.com/workers/>. CF KV docs:
<https://developers.cloudflare.com/kv/>.
