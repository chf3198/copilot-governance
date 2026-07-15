---
title: "#3800-AC4 Manager scope — shadow-period FP-metric + data-driven promotion decision"
type: work-log
role: MANAGER
ticket: 3800
ac: 4
created: "2026-07-15"
status: SCOPED
---
# #3800-AC4 — Manager scope

## AC4 criterion (verbatim from committed 3800.md)
> AC4: **Phase-1** — Shadow-period metric (false-positive rate over the corpus); promote EB1/EB2/EB3
> from advisory to a hard Epic-close gate only at < 2% FP.

## Epic hard gate (from 3800.md)
> Promotion of any invariant from advisory to blocking requires the AC4 shadow metric AND a
> cross-model consensus review (≥2 distinct free-cloud families) on the false-positive analysis.

## Disposition: deliver the METRIC (new advisory); make the promotion decision DATA-DRIVEN (defer, honestly)
AC4 has two verbs: (1) produce the shadow-period metric, (2) promote to a blocking gate ONLY IF
< 2% FP. The mandate is measure-then-conditionally-promote — it does NOT require promotion to happen.

**Deliverable**: a NEW advisory validator `scripts/epic-baton-shadow-metric.js` that measures the
`epic-child-baton-traceability` advisory's finding-rate over BOTH corpora the gate could scan:
- **Tracked (committed) corpus** — what a CI-wired gate actually sees. This is the gate-readiness
  number.
- **Working-tree (untracked mirror) corpus** — the "shadow" backlog figure (~640 historical
  instances). These are pre-existing TRUE-positives (real bundling drift), NOT false-positives; they
  are the AC5 historical-backfill backlog.

It emits a `promotionReadiness` verdict per the < 2% rule, computed against the corpus a blocking gate
would scan.

**Promotion decision (pre-registered, to be confirmed by the data)**: a blocking gate is SAFE only
against the tracked corpus (where the advisory finds 0 → 0% and cannot brick a legitimate close). The
existing advisory `main()` scans the WORKING-TREE wiki dir (~640 findings) — promoting THAT wiring to
blocking would brick every commit on historical true-positives. Therefore **promotion is DEFERRED**
pending AC5 (historical backfill / grandfathering) and a tracked-tree-scoped gate wiring. This is the
correct data-driven outcome of AC4's `< 2% FP` conditional, and matches the #1948 precedent
(blocking-promotion deferred pending a properly-scoped corpus). The FP-vs-true-positive distinction is
stated explicitly (true FP-rate would need a labeled corpus; the tracked-corpus finding-rate is a
sound upper bound = 0%).

## Acceptance gate for this AC
1. `scripts/epic-baton-shadow-metric.js` — pure `shadowMetric({trackedTickets, worktreeTickets})`
   core reusing `epic-child-baton-traceability.auditEpics()`; reports per-corpus counts by code +
   `promotionReadiness` ({ ready:boolean, reason }). Advisory-first CLI (exit 0).
2. Sibling `scripts/epic-baton-shadow-metric.spec.js` + `inventory/harness-self-test-registry.json`
   entry (validator-discipline). NEW validator ⇒ wired default-on advisory in `governance-verify`
   (env-silenceable try/catch, NEVER contributes to `issues`) + `<result>` Advisories field + CLI
   print line — copy the accountable-team/autonomy-classifier/mirror-admin block.
3. Low-FP: the metric REPORTS counts; it does not itself flag prose. 0 spurious behavior.
4. NEW validator ⇒ enforcement count moves 25→26; run `enforcement-wiring-audit` (26/26, 0 unwired)
   THEN `enforcement-telemetry --update-baseline` (baseline MUST move). Hermetic clean-tree specs green.
5. Cross-family ≥2-distinct-family PASS on the FP analysis (satisfies the Epic hard-gate consensus
   requirement); receipt cited.
6. Flip AC4 `[ ]`→`[x]` on 3800.md with the metric + the documented DEFER-promotion decision; parent
   #3800 stays OPEN (AC5 remains). Update `docs/howto/epic-child-baton-traceability.md` promotion-path
   section to reference the shadow-metric + the tracked-vs-worktree scoping requirement.
7. Full baton artifacts under `wiki/work-log/ticket-3800/ac4-*`.

## Constraints
- Touch ONLY #3800 files: new `scripts/epic-baton-shadow-metric.js`(+spec), `governance-verify.js`
  (advisory wiring only), `inventory/harness-self-test-registry.json`,
  `inventory/enforcement-telemetry-baseline.json` (baseline bump for the new validator),
  `docs/howto/epic-child-baton-traceability.md`, `wiki/work-log/tickets/3800.md`,
  `wiki/work-log/ticket-3800/*`. Do NOT flip EB1/EB2/EB3 to blocking (promotion deferred).
- NO manufacturing: the ~640 are reported as historical true-positive backlog, NOT relabeled as FP;
  the true FP-rate caveat (needs labeled corpus) is stated. Do NOT backfill closeouts (that is AC5,
  and fabricating closeout prose is forbidden — see 1893.md MC3 precedent).
- Reversible (feature push + PR + squash-merge to UNPROTECTED main; advisory-only, no blocking flip)
  ⇒ autonomous completion (G8). Autonomy-Decision: reversible.
