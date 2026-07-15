---
title: "#3800-AC5 Manager scope — historical backfill PLAN + dry-run exemption classifier (NO fabrication)"
type: work-log
role: MANAGER
ticket: 3800
ac: 5
created: "2026-07-15"
status: SCOPED
---
# #3800-AC5 — Manager scope

## AC5 criterion (verbatim from committed 3800.md)
> AC5: **Phase-1** — (Scoped, optional) historical backfill plan for the ~640 pre-existing instances
> — deterministic, additive, dry-run default; NOT required to close the guard, tracked as a separate
> child.

## HARD integrity constraint (why this is NOT a closeout-fabrication)
The ~327 distinct flagged historical children are pre-existing TRUE positives (see AC4). Backfilling
fabricated `CONSULTANT_CLOSEOUT` / `GitHub Evidence Block` prose onto long-merged tickets is
FORBIDDEN — it manufactures governance evidence (the 1893.md `MC3_missing_closeout` precedent:
"backfilling a long-merged closeout = manufacturing evidence — LEAVE it"). Therefore AC5 delivers a
**plan + dry-run classifier**, NOT a closeout-writer. It fabricates nothing.

## Disposition: honest exemption-manifest, dry-run default
The AC4 shadow-metric deferred the EB1/EB2/EB3 → blocking promotion because a working-tree-scanning
gate would brick on the 327 historical instances. AC5's job is to make that promotion SAFELY reachable
WITHOUT fabricating evidence, by producing a **deterministic pre-cutoff exemption manifest**:
- Classify each flagged child by a deterministic signal:
  - **grandfather (pre-cutoff)**: created/closed before the #3800 guard cutoff → EXEMPT from a future
    BLOCKING gate (the advisory STILL reports it — transparency preserved; nothing is silenced or
    fabricated).
  - **has-real-evidence-elsewhere**: a genuine PR/receipt/closeout exists in a sibling
    `ticket-<N>/` file or git history → the plan records a POINTER to that REAL evidence (no new prose).
  - **must-remediate (post-cutoff)**: recent enough to require a real per-child baton → NOT exempt;
    the plan lists it for genuine remediation (human/role work), never auto-backfilled.
- Emit the manifest as a DRY-RUN report by default (no file mutation); a future promotion (separate
  child) can consume the manifest to scope a blocking gate to (tracked ∧ ¬grandfathered ∧ post-cutoff).

## Deliverable
`scripts/epic-baton-backfill-plan.js` — pure `classifyInstance(ticket, cutoffISO)` +
`backfillPlan(flaggedTickets, {cutoffISO})` → `{ grandfather:[], hasEvidence:[], mustRemediate:[],
summary }`. Advisory-first CLI (dry-run default; exit 0). NO write path in the default; any
apply/materialize path is explicitly out of scope for AC5 (plan only).

## Acceptance gate
1. `scripts/epic-baton-backfill-plan.js` pure core + dry-run CLI reusing the epic-child ticket shape;
   deterministic classification; NEVER writes closeout prose.
2. Sibling spec + `harness-self-test-registry.json` entry. NEW validator ⇒ wired default-on advisory
   in `governance-verify` (env-silenceable try/catch, never in `issues`) + `<result>` field + CLI
   print line. Enforcement count moves 26→27; `enforcement-wiring-audit` (27/27, 0 unwired) THEN
   `enforcement-telemetry --update-baseline`.
3. Low-FP: the advisory only REPORTS the plan summary; it does not itself flag prose. 0 spurious.
4. Hermetic clean-tree specs green. Cross-family ≥2-distinct-family PASS receipt; cited.
5. Flip AC5 `[ ]`→`[x]` on 3800.md. Since AC1–AC6 are then all resolved, evaluate closing parent
   #3800 → DONE with a CONSULTANT_CLOSEOUT (C1 receipt + C2 PR ref + C3 closeout) +
   `accountable-team:claude-code` label (AT4 guard). Update `docs/howto/epic-child-baton-traceability.md`
   promotion-path with the exemption-manifest as the promotion unblocker.
6. Full baton artifacts under `wiki/work-log/ticket-3800/ac5-*`.

## Constraints
- Touch ONLY #3800 files. Do NOT fabricate closeout/evidence prose on any historical ticket
  (dry-run plan only). Do NOT flip EB1/EB2/EB3 to blocking (that remains a separate future child;
  AC5 only makes it reachable).
- Reversible (advisory-only, feature push + PR + squash-merge to UNPROTECTED main) ⇒ autonomous (G8).
  Autonomy-Decision: reversible.
