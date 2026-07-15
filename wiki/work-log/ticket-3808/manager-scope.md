---
title: "#3808 Manager scope — canonical state-semantics enum module (Epic 2632 Phase-1 P1-a)"
type: baton
role: manager
ticket: 3808
parent_epic: 2632
created: "2026-07-15"
signed_by: claude-code
---

# #3808 — Canonical state-semantics enum module (Phase-1 P1-a)

> **Parent**: Epic 2632 · **Authorizing synthesis**: `wiki/wisdom/project/research/state-semantics-synthesis-2632.md`
> (child 3807, Phase-0, gate cleared 2026-07-15 receipt cac5cf2be3f94598, >A- consensus).
> **Lane**: enforcement-first code child · **Autonomy (G8)**: unprotected-main merge ⇒ reversible ⇒ autonomous.

## Goal

Land the **first** Phase-1 child from synthesis §6.1: a single canonical source-of-truth enum module for
the two-axis state model. Pure constants + helpers, **no behavior change** — this module is the substrate
that P1-b's invariant checks (I1–I5) will consume. It replaces the ad-hoc, scattered label/status
vocabularies (§1) with one importable definition.

## Scope (this ticket only)

Deliver `scripts/state-semantics.js` implementing exactly the model in synthesis §3.1–§3.2:

- **Axis-B lifecycle enum**, partitioned:
  - `ACTIVE` (issue MUST be OPEN): `backlog, todo, queued, triage, ready, in-progress, testing, review, measuring`.
  - `EPIC_ONLY_ACTIVE` (issue MUST be OPEN, epic holds only): `deferred, dormant`.
  - `TERMINAL` (issue MUST be CLOSED): `done, cancelled, archived`.
  - `ALIASES`: `advisory-complete → done` (§3.1: fold into `done` w/ `resolution:advisory`, no new terminal state).
- **Axis-A existence enum**: `AXIS_A = {OPEN, CLOSED}` (§3.2 — existence bit, not a lifecycle field).
- Pure helpers (deterministic, side-effect-free):
  - `classify(label)` → `'active' | 'terminal' | 'unknown'` (alias-resolved).
  - `axisAOf(label)` → `'OPEN'` (active) | `'CLOSED'` (terminal) | `null` (unknown) — the required
    frontmatter status implied by a lifecycle label (the I1 mapping, as data — NOT yet enforced here).
  - `isCanonicalStatus(s)` → boolean (Axis-A enum closure, for I5).
  - `isKnownLabel(label)` → boolean (Axis-B enum closure, for I5).

## Acceptance criteria

- **AC1** `scripts/state-semantics.js` exports the partitioned enums + `classify` + `axisAOf` +
  `isCanonicalStatus` + `isKnownLabel`; pure (Node built-ins only, no fs/net/CLI required to import).
- **AC2** Sibling `scripts/state-semantics.spec.js` (Node `assert`, self-executing, `exit 1` on failure)
  covering every partition, the alias fold, unknown-label handling, case-insensitivity, and the
  `classify`↔`axisAOf` consistency (terminal⟺CLOSED, active⟺OPEN).
- **AC3** Registry entry in `inventory/harness-self-test-registry.json` (validator-discipline #1893).
- **AC4** `.github/workflows/state-semantics.yml` runs the spec on PR (own enforced root).
- **AC5** ENFORCED: `node scripts/enforcement-wiring-audit.js` reports the new module ENFORCED,
  **0 UNWIRED**; telemetry baseline refreshed (27→28, still enforcedRatio 1).
- **AC6** No behavior change to any existing validator (P1-b does the wiring). Advisory-first posture.

## Out of scope (later Phase-1 children)

- P1-b: wiring I1–I5 as default-on advisory into the four validators + governance-verify.
- P1-c: the one-time frontmatter/label migration (16 M4 + 27 M2 + I2 dedup).
- P1-d: promoting I1 to a hard close-gate after ρ<2% soak.

## Verification gates

- Hermetic spec green on a clean `.git`-less tree (node built-ins only).
- `enforcement-wiring-audit`: 0 UNWIRED (new validator enforced).
- Cross-family consensus (kind=review, ≥2 distinct families, PASS) ratifying the enum model + module;
  receipt cited on this ticket.
- Full baton Manager→Collaborator→Admin→Consultant; one branch = one ticket = one PR.

Signed-by: claude-code
Team&Model: claude-code:claude-opus-4-8
Role: manager
verification-timestamp: 2026-07-15T00:00:00Z
