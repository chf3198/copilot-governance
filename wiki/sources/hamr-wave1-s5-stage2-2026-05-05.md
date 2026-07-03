---
title: "HAMR Wave 1 S5 Stage-2 Reasoning Quiz 2026-05-05"
type: source
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, wave1, judge-quorum, stage2, rule-coverage, validation]
sources: [raw/articles/hamr-wave1-s5-stage2-2026-05-05.md]
related: ["[[hamr-v3-2-2026-05-04]]", "[[hamr-spike-s5-distillation-2026-05-04]]", "[[judge-quorum]]"]
status: draft
---

# HAMR Wave 1 S5 Stage-2 Reasoning Quiz 2026-05-05

## Summary

Live execution of the v3.2 §R6 Stage-2 reasoning-grounded rule-
coverage gate via the `judge-quorum.js` (#895) architecture. 60-
question quiz authored; 20-Q balanced subset run (Groq rate-limit
constraint).

**HEADLINE: v3.2 §R6 ≥97% Stage-2 threshold is NOT achievable
with current free-fleet 2-of-N quorum.** Architecture validated;
threshold needs revision.

## Measured

- Direct (n=10): mean 0.55 / ≥0.97: 30% / ≥0.50: 80%.
- Counter-factual (n=6): mean 0.50 / ≥0.97: 33% / ≥0.50: 67%.
- Boundary (n=4): all 0 (judges mostly returned "not found in
  bundle" — no chain-of-reasoning).
- Family-fallback Cerebras → Gemini: 14/14 successful covers.
- Quorum-of-2 reachability: 17/20 grades returned (Groq grader
  carried; Gemini grader needs higher max_tokens).

## Decisions (D1–D4)

- **D1 REVISE Stage-2 → 3 stages:** Stage-1 deterministic ≥99%
  keyword (unchanged); Stage-2a free-fleet 2-of-N quorum ≥80%
  on direct + counter-factual; Stage-2b paid-tier OR fine-tuned
  ≥95% including boundary; Stage-3 operator review for any rule
  scoring <0.50 in Stage-2b.
- **D2 Family-fallback architecture VALIDATED.** No code change to
  judge-quorum.js.
- **D3 Sequential 3+ s spacing required** for free-fleet path.
- **D4 Per-family max_tokens calibration**: Gemini ≥256 candidate /
  ≥48 grader; Groq + Cerebras ≥24 grader OK.

## Threats to validity

- 20/60 subset (Groq rate-limited). Boundary class n=4 thin.
- Grader strictness varies by family (Groq harsh on phrasing).
- Judges did not chain reasoning reliably for boundary cases.
- Single operator run; no N=5 stochasticity for Stage-2.

## Citations

Primary source: `research/hamr-wave1-s5-stage2-2026-05-05.md`
(this PR, issue #893). Comparison baseline:
`research/hamr-spike-s5-distillation-2026-05-04.md` (#880). HAMR
v3.2 §R6 input contract:
`research/hamr-v3-2-2026-05-04.md` (#890). judge-quorum.js (Wave
1 module): `scripts/global/judge-quorum.js` (#895).
