---
name: Cross-Team Artifact-Write Contract
description: Governs accountability when Team A authors a config/artifact that Team B's runtime parses. Target-runtime team owns the schema/contract test.
applyTo: "**"
---

# Cross-Team Artifact-Write Contract

A cross-team artifact write occurs when Team A (the authoring team) creates or
modifies a file that is **consumed and parsed by Team B's runtime**. The canonical
example is a Codex team authoring `.claude/settings.json` (a Claude Code config).
Without an explicit contract, schema-correctness accountability is ambiguous, and
the manager-handoff can be marked complete without validating runtime parseability.

## Authoring-Team Responsibilities

1. **Signal the write** — The MANAGER_HANDOFF must list every cross-runtime file
   created or modified under `cross_runtime_writes: [<path>, ...]`.
2. **Reference the schema** — The branch must include a citation to the target
   runtime's schema (doc link, JSON Schema file, or template path).
3. **Functional intent only** — The authoring team is responsible for correct
   functional intent (the right hook, key name, or value). Parse-validity is
   owned by the target team (see below).
4. **Tag target team** — Post a `TEAM_QUESTION` comment on the issue naming the
   target team and requesting schema-validation sign-off before manager-handoff.

## Target-Runtime-Team Responsibilities

1. **Own the schema test** — The target-runtime team is accountable for a
   passing schema/contract test that validates any cross-team-written config
   against the runtime's accepted format.
2. **Sign off before manager-handoff** — The target team must post a
   `TEAM_RESPONSE` comment with `verdict: schema-valid` or `verdict: schema-invalid`
   before the authoring team's MANAGER_HANDOFF can be marked complete.
3. **Maintain the test** — The schema test lives in the target team's test suite
   and is updated whenever the runtime schema changes.

## Required Artifacts Before Manager-Handoff Completes

For any ticket with `cross_runtime_writes` populated, the MANAGER_HANDOFF
evidence block must include:

```
cross_runtime_writes:
  - path: <file>
    target_team: <team>
    schema_source: <schema doc or file path>
    target_team_sign_off: <TEAM_RESPONSE comment URL or "pending">
```

A manager-handoff with `target_team_sign_off: pending` is incomplete. The baton
does NOT advance to Collaborator until sign-off is received.

## TEAM_RESPONSE Signer Fidelity (validator-enforced)

TEAM_RESPONSE artifacts MUST be authored by the target team, not by the
source team using a target-team alias. The validator at
`scripts/global/megalint/cross-team-response-fidelity.js` enforces this
by comparing the artifact's `from:` (target team) field against the
signer's `Team&Model:` team string parsed via
`scripts/global/megalint/signer-registry-check.js#parseTeamModel`.
Violations: `team-response-signer-team-mismatch` when the signer's team
does not match the from-field; `signer-alias-non-derived` when the
`Signed-by:` literal does not match the registry-derived alias for the
asserted (team, model, role) tuple.

Residual gap: perfect-forgery (source team forges both alias AND team-
model string) requires the optional Crypto-Signature fields per
`instructions/team-model-signing.instructions.md` to detect. The
validator catches the common case which is the round-2 + round-3
evidence on #2360 (#2370 anneal).

Validator promotion: ships advisory; promotion to blocking is a CI-
workflow-config decision after one cycle of advisory soak.

## Failure Mode: Schema Regression Recovery

If a cross-team artifact write causes a runtime schema rejection after merge,
invoke the Breaking-Change Recovery Protocol from
`instructions/breaking-change-recovery.instructions.md`.

## Cross-References

- `instructions/role-baton-routing.instructions.md` — MANAGER_HANDOFF gate
- `instructions/team-model-signing.instructions.md` — TEAM_QUESTION/TEAM_RESPONSE signing
- `skills/repo-standards-router/SKILL.md` — when to flag a cross-team artifact write
