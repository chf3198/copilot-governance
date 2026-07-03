---
title: "HAMR Wave 1 S4 Live Cache 2026-05-05"
type: source
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, wave1, prompt-cache, anthropic, live-measurement, validation]
sources: [raw/articles/hamr-wave1-s4-live-cache-2026-05-05.md]
related: ["[[hamr-v3-2-2026-05-04]]", "[[hamr-spike-s4-prompt-cache-2026-05-04]]", "[[anthropic-prompt-cache]]"]
status: draft
---

# HAMR Wave 1 S4 Live Cache 2026-05-05

## Summary

Closes the hit-rate validity gap from S4 analytical spike (#879).
20 live calls to `claude-sonnet-4-5` against a 14,073-token HAMR
governance bundle (instructions/* + 4 wiki concept pages). Total
spend $0.18 (under $0.50 cap).

## Measured reductions

- **5m ephemeral**: 83.82% (1 write + 9 reads, 90% hit rate).
  Exceeds v3's 72% claim by +11.8 pp.
- **1h extended**: 90.59% (10 reads against still-warm cache from
  session A). Exceeds v3 by +18.6 pp.

## Decisions

- **CONFIRM** v3 §R5 (1-h extended cache as default for HAMR's
  15–60 min baton sessions).
- **CONFIRM** v3 80% hit-rate floor: measured 90% (5m) and 100%
  (1h) bracket the floor on the high side.
- Bundle-rebuild rate-limit ≥5 min at Worker layer remains
  required (R5 unchanged).

## Threats to validity

- Session B reused session A's cache (1h write surcharge not
  actually paid; deferred isolation measurement to Wave 4).
- Single bundle, single tail set — but cache hit depends only on
  prefix byte-identity, so generalizable.

## Citations

Primary source: `research/hamr-wave1-s4-live-cache-2026-05-05.md`
(this PR, issue #892). Comparison baseline:
`research/hamr-spike-s4-prompt-cache-2026-05-04.md` (#879). HAMR
v3.2 §R5 input contract: `research/hamr-v3-2-2026-05-04.md`
(#890). Anthropic prompt-caching reference:
<https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching>.
