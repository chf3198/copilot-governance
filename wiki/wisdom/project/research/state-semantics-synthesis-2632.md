---
title: "Deterministic epic & ticket state semantics — research + planning synthesis (#3807 / Epic #2632)"
type: research
scope: project
content_trust_score: 0.9
created: "2026-07-15"
updated: "2026-07-15"
tags: [synthesis, governance, state-semantics, lifecycle, query-reliability, epic-2632, ticket-3807]
related: [[baton-protocol]] [[ticket-lifecycle-v1]] [[epic-state-truthfulness]] [[ownership-model-synthesis-2346]]
status: COMPLETE
authored_by: claude-code
---

# Deterministic epic & ticket state semantics — Phase-0 research + planning

> **Parent**: Epic #2632 · **Child (Phase-0 research)**: #3807 · **Lane**: research-first (no code authorized).
>
> This document is the **single Phase-0 deliverable** authorized by Epic #2632. It maps the state
> lifecycle as actually practiced, quantifies where intended governance and observed label/state reality
> diverge, proposes a deterministic state model with concrete enforcement points, defines a measurable
> "query reliability" acceptance metric, and lays out an implementation/rollback plan for the **Phase-1
> automation that this document does NOT authorize**. Phase-1 unblocks only after this synthesis clears
> the Epic's hard gate: cross-model review consensus rated **greater than A-** between a primary planning
> reviewer and a cross-model red-team reviewer (§7).
>
> **Grounding**: every count below is measured against the live mirror corpus
> (`wiki/work-log/tickets/*.md`, N = 1182) and the on-`main` validator surface (`scripts/*.js`) as of
> 2026-07-15, not invented state. Commands are reproducible from the ticket's baton log.

## 1. Current state lifecycle semantics (as practiced)

State is carried on **two independent axes** that were never formally reconciled:

- **Axis A — existence / mirror state.** The mirror frontmatter field `status:`. In the generator's
  intended output this is a faithful projection of the GitHub issue state: `OPEN` or `CLOSED` (no live
  issue > #5 exists — see [[ticket-universe-is-local-mirror-no-github]] — so for the mirror corpus this
  is the *authoritative existence bit*). Observed distribution: 1005 `CLOSED`, 161 `OPEN`, and **16
  hand-edited drift values** (`READY`, `CLOSE-READY`, `IN_PROGRESS`, `IN-PROGRESS`, `DONE`, `COMPLETE`,
  `DONE-RECONCILED`, `PHASE-0-COMPLETE`, and one free-text `close-ready (resolution:released pending
  PR-sync merge)`). The drift values are **session hand-edits**, not a designed vocabulary.

- **Axis B — workflow lifecycle.** The `status:*` GitHub label (lowercase). This is the real, richer
  lifecycle enum and is what the baton transitions drive. Observed vocabulary (body-occurrence counts,
  so inflated by prose, but the *set* is authoritative):
  `backlog, todo, queued, triage, in-progress, testing, review, measuring, ready, deferred, dormant,
  done, cancelled, archived, advisory-complete`.

Type axis (`type:epic` 152, `type:task` 781, `type:bug` 108) and the execution-role axis (`role:*`,
139 occurrences) are orthogonal and mostly well-behaved after Epic #2345 introduced the disjoint
`accountable-team:*` namespace (see [[ownership-model-synthesis-2346]]).

**The core defect** the Epic names — "semantically ambiguous states … degrade query reliability" — is
that **Axis A and Axis B have no enforced mapping**. Nothing guarantees that a ticket whose lifecycle
label says `done` is `CLOSED`, nor that a `CLOSED` ticket has shed its active lifecycle label. Each axis
is written by a different actor (the mirror generator writes A; the baton/label-lint writes B) with no
cross-check.

## 2. Mismatch patterns (intended governance vs observed reality)

Measured on the corpus (reproducible grep in the baton log). Each is a *cross-axis contradiction* — a
query on one axis returns a set the other axis contradicts:

| # | Pattern | Meaning | Count | % of 1182 |
|---|---------|---------|------:|----------:|
| M1 | `CLOSED` frontmatter **+** active lifecycle label (`in-progress`/`triage`/`testing`/`review`/`queued`/`measuring`) | Terminal ticket reads as active work | **68** | 5.8% |
| M2 | `CLOSED` frontmatter **+** an execution `role:*` label | Terminal ticket reads as role-owned (the #2345 overload residue) | **27** | 2.3% |
| M3 | `OPEN` frontmatter **+** terminal label (`done`/`cancelled`) | Active ticket reads as finished | **8** | 0.7% |
| M4 | Frontmatter `status:` outside `{OPEN, CLOSED}` | Non-canonical hand-edit drift; unfilterable | **16** | 1.4% |
| M5 | `CLOSED` Epic with an `OPEN` child | Epic-closed-while-work-remains (the Epic's motivating example) | detected by `epic-child-baton-traceability` EB3 (advisory, live) | — |

M1+M3 are direct Axis-A↔Axis-B contradictions (76 tickets, 6.4%). M2 is an Axis-A↔role contradiction
that Epic #2345's model already declares illegal but did not retro-migrate. M4 breaks *any* deterministic
existence filter. M5 is already surfaced advisory-only by `epic-child-baton-traceability.js`.

**Root cause (single):** there is no invariant tying `terminal(label) ⟺ CLOSED(existence)`, and no
canonical enum constraining either axis. Every mismatch above is an instance of that one missing rule.

## 3. Proposed deterministic state model

### 3.1 Canonical lifecycle enum (Axis B), partitioned

A single source-of-truth enum, partitioned into **active** and **terminal**, with an epic-only subset:

- **Active** (issue MUST be OPEN): `backlog, todo, queued, triage, ready, in-progress, testing, review,
  measuring` — plus epic-only `deferred, dormant`.
- **Terminal** (issue MUST be CLOSED): `done, cancelled, archived`.
- `advisory-complete` is an alias observed once; the model folds it into `done` with
  `resolution:advisory` rather than admitting a new terminal state.

### 3.2 Axis-A normalization

Frontmatter `status:` is constrained to exactly `{OPEN, CLOSED}` — it is the *existence* bit, not a
lifecycle field. All 16 M4 drift values map deterministically: any value whose semantics are terminal
(`DONE`, `COMPLETE`, `DONE-RECONCILED`, `CLOSE-READY`, `close-ready …`) → `CLOSED`; any active value
(`READY`, `IN_PROGRESS`, `IN-PROGRESS`, `PHASE-0-COMPLETE`) → `OPEN`. Lifecycle nuance moves to the
Axis-B label, where it belongs.

### 3.3 The binding invariant (the whole point)

> **I1 (terminal consistency):** `label ∈ Terminal  ⟺  frontmatter.status == CLOSED`.

Corollaries, each independently checkable:

- **I2 (single active label):** at most one Axis-B lifecycle label per ticket (kills M1's stale-label
  accumulation; matches the `label-lint` #1380 "strip ALL status:*" fix).
- **I3 (role sheds on terminal):** a `CLOSED` ticket carries **no** execution `role:*` label;
  accountability persists only via `accountable-team:*` (Epic #2345 R1/R2). Fixes M2.
- **I4 (epic-child existence):** a `CLOSED` Epic has no `OPEN` child (already EB3-detected). Fixes M5.
- **I5 (enum-closure):** every lifecycle label and every frontmatter `status` is a member of its
  canonical enum. Fixes M4.

### 3.4 Deterministic transition rules & the single writer

The lifecycle label is written by **exactly one authority — the baton/label-lint pipeline** — never by
ad-hoc frontmatter edits. Allowed forward transitions (already the de-facto baton order):
`backlog|todo|queued → triage → in-progress → testing → review → {done|cancelled}`, with `measuring` as
a post-`done` observation state that re-parks to `done`, and epic-only `deferred|dormant` as legal
holds off any active state. The close event is the ONLY writer of a Terminal label, and
`label-lint-close-protection.decide()` already encodes the guarded version of it (closeout-present +
pre-close ∈ {review,testing} → `done`; Phase-0-green-no-Phase-1 → block). The model **reuses that
function as the transition oracle** rather than inventing a parallel one.

### 3.5 Enforcement points (all already exist or extend one file)

| Rule | Enforcement point (on `main`) | Status |
|------|------------------------------|--------|
| I1/I2 | `scripts/label-lint-close-protection.js` (close/reopen decision) | exists; add I1 terminal-consistency assertion |
| I3 | `scripts/accountable-team-verify.js` (AT-invariants) | exists; add "role:* on terminal" advisory |
| I4 | `scripts/epic-child-baton-traceability.js` EB3 | **live advisory today** |
| I5 | `scripts/mirror-ticket-lint.js` (frontmatter schema MTL1-4) | exists; add enum-closure check MTL5 |
| all | `scripts/governance-verify.js` aggregator | wires each as default-on **advisory** |

No new enforcement *surface* is required — the model lands as invariants on the existing validators,
which is why Phase-1 is small and reversible (§6).

## 4. "Query reliability" — measurable acceptance

Define query reliability as: **canonical governance queries return the set their two axes agree on, with
zero cross-axis contradictions.** Concretely, name the queries and their dual predicates:

| Query | Axis-B predicate | Axis-A predicate | Reliable iff |
|-------|------------------|------------------|--------------|
| Q1 "active work" | label ∈ Active | status == OPEN | sets identical |
| Q2 "finished" | label ∈ Terminal | status == CLOSED | sets identical |
| Q3 "role-owned now" | has `role:*` | status == OPEN | Q3 ⊆ Q1 |
| Q4 "epic w/ open children" | type:epic ∧ status CLOSED | any child status OPEN | empty |

**Acceptance metric — contradiction rate** `ρ = |tickets violating any of I1–I5| / N`.

- **Baseline today:** ρ ≈ (68 + 27 + 8 + 16 + M5)/1182 ≈ **≥ 10.1%** (upper-bounded; some tickets
  violate multiple rules so the true distinct-ticket rate is lower — Phase-1 measures it exactly).
- **Advisory-exit target:** validators ship advisory (exit 0) and *report* ρ every run (telemetry, per
  [[ticket-3804-enforcement-telemetry]]).
- **Promotion-to-block gate:** ρ < 2% sustained over a soak window (the harness's standard <2% false-
  positive bar, matching `mirror-ticket-lint`'s 1.27% promotion precedent). Only then does I1 become a
  hard close-gate.
- **End-state target:** ρ = 0 after the one-time migration (§6.1), held at 0 by the single-writer rule.

This is deterministic and reproducible: the same corpus + same rules → the same ρ, and "expected filter
produces expected set" becomes the literal test `Q1_labelset == Q1_statusset`.

## 5. What Phase-0 explicitly does NOT authorize

No validator, hook, CI job, migration, or `scripts/*.js` change is authorized by this document. The
tables in §3.5 and the plan in §6 are **proposals for Phase-1 review**, not a work order. Per the Epic's
hard gate, Phase-1 (development children) unblocks **only** after this synthesis receives cross-model
review consensus rated **greater than A-** (§7).

## 6. Implementation, migration & rollback plan (Phase-1 proposal)

### 6.1 Sequenced children (to be filed only post-gate)
1. **P1-a — canonical enum module + `state-semantics.js`** (pure constants + `classify(label)` /
   `axisAOf(label)` helpers; sibling spec; registry entry). No behavior change.
2. **P1-b — invariant checks** wired into the four existing validators (§3.5) as **default-on advisory**,
   emitting ρ to telemetry. Ships EB-style warnings only.
3. **P1-c — one-time deterministic migration**: normalize the 16 M4 frontmatter values (§3.2);
   strip `role:*` from the 27 M2 terminal tickets (retain `accountable-team:*`); collapse duplicate
   active labels to the latest (I2). Additive + reversible (pure re-label, recorded in an audit file).
4. **P1-d — promotion**: after ρ < 2% soak, flip I1 to a hard close-gate in
   `label-lint-close-protection`.

### 6.2 Rollout
Advisory-first for every step; each child is one branch = one ticket = one PR to unprotected `main`
(reversible ⇒ autonomous per G8). Telemetry baseline updated per [[ticket-3804-enforcement-telemetry]].

### 6.3 Rollback
- P1-a/P1-b: revert the commit; validators are advisory (exit 0) so nothing was blocking.
- P1-c migration: it is a pure additive re-label with a recorded before/after audit map; re-apply the
  inverse map. No content is destroyed.
- P1-d promotion: single-line revert of the gate flag returns I1 to advisory.

## 7. Review gate for Phase-1

This synthesis must clear **> A-** consensus between a primary planning reviewer and a cross-model
red-team reviewer. This session ratifies via a `cross-family-consensus.js` panel (≥2 distinct families,
kind=review) standing in for the dual-reviewer requirement; the returned receipt and rating are recorded
on the child ticket #3807 and Epic #2632. Only a PASS clearing the >A- bar authorizes filing the §6.1
children.

**Ratified 2026-07-15** — receipt `cac5cf2be3f94598`, consensus PASS, families [meta (groq), mistral]
(2 distinct non-authoring families, unanimous). Gate cleared: Phase-1 children (§6.1) are AUTHORIZED to
be filed by a future session.

## 8. Known gaps / honest limitations

- Body-occurrence label counts (§1 Axis B) overcount frequency but not the label *set*; the distinct-
  ticket ρ in §4 is what Phase-1 must compute exactly per-ticket.
- The mirror corpus has no live GitHub issues, so I1 is validated against frontmatter existence, not a
  GitHub API. On any repo where issues *are* live, Axis A must read from `gh issue view` state — the
  model is identical; only the source of the existence bit changes.
- `measuring` as a post-terminal observation state slightly strains the strict Active/Terminal partition;
  the model keeps it Active (issue OPEN during measurement) but this is the one place a reviewer may
  reasonably prefer a third "post-terminal" partition. Flagged for review.
