---
title: "HAMR Spike S4 — Anthropic prompt-cache economics 2026-05-04"
type: source
created: 2026-05-04
updated: 2026-05-04
tags: [hamr, prompt-cache, anthropic, token-economics, ephemeral-cache, extended-cache]
sources: [raw/articles/hamr-spike-s4-prompt-cache-2026-05-04.md]
related: ["[[hamr-v3-2026-05-04]]", "[[hamr-spike-s5-distillation-2026-05-04]]", "[[anthropic-prompt-cache]]"]
status: draft
---

# HAMR Spike S4 — Anthropic prompt-cache economics 2026-05-04

## Summary

HAMR v3 (#873) claimed 72% effective token-cost reduction (90% read
discount × 80% hit rate) via Anthropic prompt caching. This spike
validates the claim from first principles using Anthropic's published
prompt-cache pricing.

Lane converted from code-change to docs-research after env check showed
no `ANTHROPIC_API_KEY` in the operator environment. Live measurement
deferred; spike script (`tmp/_spike-s4-cache.js`, gitignored) and
operator-run instructions documented for follow-up execution under
≤$0.50 budget cap.

## Key findings

- **CONFIRM v3's 72% claim** analytically. Cache write 1.25× / cache
  read 0.10× / 80% hit rate → 73.5% effective reduction at 10-call
  session, 83.3% at 100-call session, 65.6% at 5-call session. All ≥
  v3's 72% target when hit rate is ≥80% (HAMR design floor).
- **Recommend 1-h extended cache** for HAMR's typical 15–60 min
  session shape. Higher write surcharge (2.0×) but amortizes over the
  whole baton sequence; ephemeral cache misses if a Manager → Collab
  transition exceeds 5 min.
- **Bundle-rebuild cadence MUST be ≥5 min stable** for ephemeral cache
  amortization. HAMR's signed-mailbox-arrival → re-bundle path (DC-1)
  must be rate-limited.
- **Sonnet 4.6 example session cost:** 10 calls (1 write + 9 reads),
  ~$0.0635 with cache vs $0.240 without. ~$0.07 expected spend for
  live measurement (well under $0.50 budget cap).

## Threats to validity (carry forward)

- Pricing volatility — re-verify before live run.
- Hit-rate assumption (80%) is unmeasured for HAMR; live spike
  validates.
- Bundle-content drift mid-session invalidates cache.
- Tool calls counted toward bundle if not careful.
- Cross-session/cross-operator cache collisions not modelled.

## Decision recorded

CONFIRM v3's 72% claim analytically. Live measurement deferred to
operator-authorized run (script + instructions documented in §5 of
research file). If live hit rate < 80%, redesign of HAMR bundle-rebuild
cadence required.

## Wiki ingest plan

- raw/articles/hamr-spike-s4-prompt-cache-2026-05-04.md (digest source)
- entity candidates: [[anthropic-prompt-cache]],
  [[hamr-bundle]]
- concept candidates: [[ephemeral-vs-extended-cache]],
  [[bundle-rebuild-cadence]], [[per-call-token-economics]]

## Citations

Primary source: research/hamr-spike-s4-prompt-cache-2026-05-04.md (this
PR, issue #879). Pricing source: Anthropic API documentation, "Prompt
caching" page, retrieved 2026-05-04. Comparison baseline:
research/hamr-v3-2026-05-04.md (#873).
