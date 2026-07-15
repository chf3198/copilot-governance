---
ticket: 2632
role: collaborator
phase: phase-0
status: HANDOFF
signed_by: claude-code
team_model: anthropic:claude-opus-4-8
created: "2026-07-15"
---

# COLLABORATOR_HANDOFF — #2632 Phase-0

## What was built
The single Phase-0 research/planning child #3807 and its deliverable:
`wiki/wisdom/project/research/state-semantics-synthesis-2632.md`.

The synthesis delivers all five outputs the Epic's Phase-0 scope requires:
1. State lifecycle map — two independent, unreconciled axes (Axis-A existence `{OPEN,CLOSED}`;
   Axis-B lifecycle label enum), grounded in the N=1182 mirror corpus.
2. Mismatch patterns quantified against real data: M1=68 (terminal-reads-active), M2=27
   (terminal-role-owned), M3=8 (active-reads-terminal), M4=16 (frontmatter drift), M5 (closed-epic /
   open-child, already EB3-detected).
3. Deterministic state model — canonical enum + binding invariant **I1** `terminal(label) ⟺ CLOSED`
   with corollaries I2–I5, single-writer transition rule reusing `label-lint-close-protection.decide()`
   as the transition oracle, and enforcement points mapped onto four EXISTING validators (no new surface).
4. Measurable query-reliability acceptance — contradiction rate `ρ` with named dual-predicate queries
   Q1–Q4; baseline ≥10.1%, advisory-report → promote-to-block at ρ<2% soak → target ρ=0.
5. Implementation/migration/rollback plan (§6) — sequenced Phase-1 children P1-a..P1-d, additive &
   reversible.

## Evidence
- Corpus counts reproducible via the greps recorded in this baton log (§1–§2 of the synthesis).
- No `scripts/*.js`, hook, CI, or migration change was made — Phase-0 is research-only per the Epic's
  hard gate (correct research-first discipline; contrast the #2345 out-of-order violation).

## Validation
Cross-family consensus PASS, receipt `cac5cf2be3f94598`, families [meta (groq), mistral] — 2 distinct
non-authoring families, unanimous, kind=review. Clears the Epic's `> A-` Phase-1 authorization gate.

## Handoff to Consultant
Verify: (a) all five outputs present & grounded; (b) no unauthorized Phase-1 code; (c) consensus receipt
valid and clears >A-; (d) Epic correctly stays OPEN with Phase-0-complete note.

Signed-by: claude-code
Team&Model: anthropic:claude-opus-4-8
Role: collaborator
