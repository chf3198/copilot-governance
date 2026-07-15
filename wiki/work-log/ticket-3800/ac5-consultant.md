---
title: "#3800-AC5 Consultant — independent critique + Epic-close review"
type: work-log
role: CONSULTANT
ticket: 3800
ac: 5
created: "2026-07-15"
status: ACCEPT
---
# #3800-AC5 — Consultant critique

## Verdict: ACCEPT — risk LOW. Epic #3800 → DONE.

### The crux: is this a backfill PLAN or manufactured evidence?
It is a plan, and it fabricates nothing. The single largest hazard for AC5 is that "backfill" becomes
a script that writes fake `CONSULTANT_CLOSEOUT` / `GitHub Evidence Block` prose onto 327 long-merged
tickets — exactly the 1893.md MC3 anti-pattern. The implementation is the opposite: `dryRun:true` and
`fabricates:false` are structural invariants (asserted in the spec), there is NO write path, and
grandfathered instances are EXEMPTED from a future blocking gate while STILL being reported by the
advisory (transparency preserved; nothing is silenced). C-G1 respected.

### Classification soundness
- Cutoff = the guard's own introduction date (`2026-07-14`), so "predates the rule" is exact, not
  arbitrary. Exactly-on-cutoff is NOT pre-cutoff (mustRemediate) — correct boundary.
- Missing `created` ⇒ mustRemediate (fail-safe), so an undated ticket is never silently grandfathered.
- `hasEvidence` keys off a REAL sibling artifact and only records a pointer — no new prose.
- On the canonical corpus: 327 grandfather, 0 must-remediate. Honest and expected (the whole backlog
  predates the guard). This genuinely unblocks the deferred AC4 promotion: a
  `(tracked ∧ post-cutoff ∧ ¬grandfather)` gate sees zero historical instances.

### Enforcement discipline
New validator handled correctly: sibling spec (11/11), registry entry, wired non-bypassable advisory
reachable from an enforced root ⇒ 27/27 enforced, 0 unwired; baseline 26→27. Hermetic clean-tree specs
green. governance-verify verdict provably unchanged (PASS).

### Epic close
All six ACs resolved. The one deferred item (advisory→blocking flip) was, by design, never an AC of
this Epic — it is a separate follow-up child that AC4 measured and AC5 unblocked. Closing #3800 is
therefore honest, not premature. Close-safety verified: no separate child asserts `Refs Epic #3800`
(no reopen loop), no open `refsEpic=3800` ticket (no EB3 drift), DONE contract C1/C2/C3 satisfied,
AT4 label added. Cross-family panel PASS on the AC5 plan + epic-close, receipt `64b8a3eaf5d40710`
(meta[groq] + mistral).

## Recommendation
Merge and close Epic #3800. The self-anneal against Epic-completion bundling drift is fully delivered
(guard + hint + metric + exemption manifest + docs), with the blocking-gate promotion cleanly teed up
as a follow-up.
