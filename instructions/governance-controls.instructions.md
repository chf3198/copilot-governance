---
name: Governance Control Catalog
description: Canonical registry for GOV-* controls referenced by goals, tickets, and closeout artifacts.
applyTo: "**"
---
# Governance Control Catalog

Use this file as the source of truth for `GOV-*` identifiers.
Any reference to a `GOV-*` token in goals, instructions, tickets, or PR bodies
must resolve to a catalog entry here.

## GOV-009 — Engineering Design Doc (EDD) Before Implementation

**Owner:** `role:manager` (approval) + `role:collaborator` (execution)

**Requirement:**
Before implementation starts for governed code-change work, attach or link a
short EDD that includes:
1. Scope and non-goals
2. Acceptance criteria and verification plan
3. Risk analysis and rollback plan
4. File-level implementation plan

**Pass condition:**
The issue/PR evidence includes a traceable EDD artifact before first
implementation commit for that ticket.

**Fail condition:**
Implementation starts without an EDD artifact, or EDD missing one of required
sections.

## Lint Contract

- CI must fail if a referenced `GOV-*` token is not defined in this catalog.
- Consultant closeout must fail if issue/PR/closeout content references an
  unresolved `GOV-*` token.
