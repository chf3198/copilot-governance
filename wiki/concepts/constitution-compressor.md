---
title: HAMR Constitution Compressor
type: concept
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, wave4, compressor, rule-coverage, judge-quorum]
related: ["[[hamr-v3-2-2026-05-04]]", "[[hamr-v3-2-1-2026-05-05]]", "[[hamr-spike-s5-distillation-2026-05-04]]", "[[judge-quorum]]"]
status: draft
---

# HAMR Constitution Compressor

## Purpose

Production constitution compressor + 3-stage rule-coverage gate.
Per HAMR v3.2 §5 child 7 + v3.2.1 §R6 update + v3.2.2 §R9.
Replaces LLMLingua-2 production path with deterministic top-k
extractive (per S5 #880 finding that the extractive path saturates
at ≈68% tokens saved with 100% keyword coverage).

## Modules

- `scripts/global/constitution-compressor.js` — produces all four
  HAMR bundle tiers (`fim-5kb`, `routing-12kb`, `governance-30kb`,
  `architect-90kb`) deterministically. Keyword-vocabulary scored
  greedy line selection; preserves original line ordering.
- `scripts/global/rule-coverage-gate.js` — 3-stage gate per
  v3.2.1 §R6 update.

## 3-stage gate

| Stage | Trigger | Threshold | Judge | Status |
|---|---|---|---|---|
| Stage-1 | every bundle build | ≥99% keyword presence | Deterministic top-k (no LLM) | ✅ shipped |
| Stage-2a | weekly | ≥80% on direct + counter-factual subset | Free-fleet 2-of-N quorum (judge-quorum.js #895) | ✅ shipped (judge dispatcher injected) |
| Stage-2b | monthly OR rule-change PR | ≥95% including boundary cases | Paid-tier OR fine-tuned | 🟡 shipped (judge dispatcher operator-cost-gated) |
| Stage-3 | on-demand | Operator manual review | Operator authority for any rule scoring <0.50 in Stage-2b | 🟡 schema-only |

## Tier compression

For each tier:

1. Read all source files (instructions/*.md and/or wiki/concepts/*.md per spec).
2. Per-line scoring: keyword hits (10pt each), heading boost (5pt), bullet boost (2pt), short-line bonus (1pt).
3. Greedy keep highest-scoring lines; preserve original order; stop when target_chars budget hit.
4. Concatenate as canonical NUL-separated `<rel>\0<content>` pairs; SHA-256 hash; deterministic filename.

Compression ratios in practice (raw → compressed): typically 0.30–0.50 (matches S5 #880 ≈32% floor at 100% keyword coverage).

## Reuse

- `hamr-bundle-build.js` (#912) ships the `governance-30kb` tier; this module supersedes it with all four tiers + per-line compression. The two coexist; #927 will route to `constitution-compressor.js` for production bundle builds.
- `judge-quorum.js` (#895) is the dispatcher for Stage-2a/Stage-2b — passed as an option, not hardcoded.

## Operator-cost discipline

- Stage-1: deterministic, no LLM cost.
- Stage-2a: free-fleet only; ≤$0 per run.
- Stage-2b: paid-tier; gated on operator authorization. Default: skipped unless `runStage2b: true` passed.
- Stage-3: operator review; no LLM cost.

## References

- HAMR v3.2 §R6 + §5 child 7: `research/hamr-v3-2-2026-05-04.md` (#890).
- v3.2.1 §R6 update (3-stage gate): `research/hamr-v3-2-1-2026-05-05.md` (#907).
- S5 distillation finding: `research/hamr-spike-s5-distillation-2026-05-04.md` (#880).
- Bundle generator (#912): `scripts/global/hamr-bundle-build.js`.
- Judge quorum (#895): `scripts/global/judge-quorum.js`.
- Implementation: this PR (#925).
