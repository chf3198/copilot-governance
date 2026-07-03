---
title: "HAMR Spike S5 — Distillation Rule-Coverage 2026-05-04"
type: source
created: 2026-05-04
updated: 2026-05-04
tags: [hamr, compression, llmlingua-2, rule-coverage, distillation, governance]
sources: [raw/articles/hamr-spike-s5-distillation-2026-05-04.md]
related: ["[[hamr-v3-2026-05-04]]", "[[hamr-spike-s1-code-audit-2026-05-04]]", "[[constitution-compressor]]"]
status: draft
---

# HAMR Spike S5 — Distillation Rule-Coverage 2026-05-04

## Summary

HAMR v3 (#873) claimed ≥97% rule-coverage at unspecified compression for the
distilled "constitution" sub-bundle. This spike (#880) measured the curve.

Two compression methods were exercised in parallel: (a) deterministic top-k
extractive over a 47-keyword governance vocabulary, (b) Cerebras llama3.1-8b
LLM rewrite with rule-preservation prompt. Both methods compress the
22,480-character source down to ~32% of original (~68% tokens saved) before
hitting an irreducible-rule floor.

A 20-question governance quiz (5 per role) graded by Cerebras llama3.1-8b
scored **20/20 at every measured compression level — 100% coverage** on both
methods.

## Key findings

- **v3's ≥97% claim is REVISED upward** at the keyword-grounded layer to
  ≥99% — empirical floor shows headroom over v3 target.
- **Deterministic top-k extractive ≈ LLM rewrite** in size and coverage at
  this scale. Recommend deterministic as first-pass compressor (zero LLM
  cost, fully reproducible).
- **Compression floor:** ~32% of source. Both methods saturate near this
  ratio; below that, rule-bearing paragraphs are evicted.
- **Two-stage gate proposed:** Stage-1 keyword-presence (every build,
  threshold 100%); Stage-2 reasoning-grounded quiz graded by stronger model
  (weekly or on rule change, threshold ≥97%).

## Threats to validity (must be carried forward)

- Grading is keyword-presence-based; biased upward.
- Judge is the small Cerebras llama3.1-8b — stronger judge needed in Stage-2.
- Quiz selection privileges unambiguous key-term answers; counter-factual
  questions are out-of-scope for this PoC.
- Compression preserves keywords by construction (both methods tuned for it).
- Stochasticity not measured (N=1 per grade).

## Decision recorded

REVISE — keyword-coverage target raised from ≥97% to ≥99%; reasoning-coverage
target stays at ≥97% but explicitly graded by a stronger model in Stage-2.
HAMR retains LLMLingua-2 as the v3 candidate compressor; adopts deterministic
top-k as the first-pass compressor in the bundle build.

## Wiki ingest plan

- raw/articles/hamr-spike-s5-distillation-2026-05-04.md (digest source)
- entity candidates: [[constitution-compressor]] (new),
  [[rule-coverage-gate]] (new)
- concept candidates: [[two-stage-coverage-gate]],
  [[deterministic-top-k-extractive]], [[keyword-grounded-grading-bias]]

## Citations

Primary source: research/hamr-spike-s5-distillation-2026-05-04.md (this PR,
issue #880). Quiz construction script and per-question results captured in
tmp/s5-grade-compressed.py and tmp/s5-final-results.json (not committed).
Comparison baseline: research/hamr-v3-2026-05-04.md (#873).
