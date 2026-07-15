---
ticket: 2632
role: manager
phase: phase-0
lane: research-first
status: SCOPED
signed_by: claude-code
team_model: anthropic:claude-opus-4-8
created: "2026-07-15"
---

# Manager scope — #2632 Phase-0 (research-first Epic)

## Ticket
Epic #2632 — "Define deterministic epic and ticket state semantics"
(type:epic, priority:P1, area:governance, status:deferred).

## Authorization boundary (HARD GATE from the Epic body)
This Epic is **research-first**. Phase-0 authorizes **exactly ONE research/planning
child ticket** and NOTHING else. No AC-checklist dev children, no validators, no code
transitions are authorized until the research/planning ticket completes AND receives
cross-model review consensus rated **greater than A-** between a primary planning
reviewer and a cross-model red-team reviewer. This session ships Phase-0 only.

## Deliverable (the single research child, #3807)
A research + planning synthesis document (tracked under
`wiki/wisdom/project/research/state-semantics-synthesis-2632.md`, force-added — the
same class as `ownership-model-synthesis-2346.md`) that MUST, per the Epic's Phase-0
scope, deliver all five required outputs:

1. **Map current state lifecycle semantics** for Epics and child tickets (the label /
   status vocabulary actually in use on the mirror corpus + intended meaning).
2. **Identify mismatch patterns** between intended governance and observed label/state
   reality (e.g. Epics closed with open children; `role:*` on terminal issues;
   `status:deferred` vs `status:dormant`; superseded-close drift).
3. **Propose deterministic state-transition rules** and the enforcement points where
   each rule can be checked.
4. **Define measurable "query reliability"** — expected label/state filters produce the
   expected issue sets — as an acceptance metric.
5. **Produce an implementation plan** with rollout, migration, and rollback strategy for
   the eventual (Phase-1, NOT-yet-authorized) enforcement automation.

## Acceptance criteria for THIS Phase-0 deliverable
- AC1: The synthesis document delivers all five required outputs above, grounded in the
  actual mirror corpus (`wiki/work-log/tickets/*.md`) and the existing validator surface
  (`scripts/*.js`), not invented state.
- AC2: The document is explicit that it authorizes **no** Phase-1 code and states the
  exact gate that unblocks Phase-1.
- AC3: The child ticket `wiki/work-log/tickets/3807.md` is created, links Parent #2632,
  and is flipped to `status: DONE` on completion.
- AC4: The critical decision (the proposed deterministic state model + query-reliability
  acceptance definition) is ratified by a cross-family consensus panel (≥2 distinct
  families, PASS) with a cited receipt; the rating must clear the Epic's ">A-" bar.
- AC5: Epic #2632 Phase-0 status is flipped from `deferred` to reflect Phase-0 complete
  / Phase-1 authorized-pending-review, via the mirror ticket.

## Out of scope (explicit)
- Any validator, hook, CI job, or `scripts/*.js` change (Phase-1, gated).
- Any change to live GitHub issue state (mirror-mode; no issue ≤ #5).
- Touching any file outside this ticket's research doc + the two mirror tickets
  (#2632, #3807) + this ticket's baton artifacts.

## Verification gates
Research lane shape (per reconciled Epic 2263): Manager → Collaborator (synthesis) →
Consultant. Admin/PR still used because the deliverable is committed & merged to the
unprotected `main` (reversible ⇒ autonomous per G8). Cross-family consensus stands in
for the Epic's dual-reviewer ">A-" gate.

Signed-by: claude-code
Team&Model: anthropic:claude-opus-4-8
Role: manager
