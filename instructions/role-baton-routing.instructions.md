---
name: Role Baton Routing
description: Enforce single-thread role handoff across Manager -> Collaborator -> Admin -> Consultant. Prevent concurrent role mixing and require explicit handoff artifacts.
applyTo: "**"
---

# Role Baton Routing

For non-trivial tasks, execute work through a single active role at a time:

1. **Manager**: scope, constraints, acceptance criteria, gate plan.
2. **Collaborator**: implementation and validation.
3. **Admin**: operational execution (services, git/PR/release ops).
4. **Consultant**: independent critique and residual-risk assessment.

## Hard rules

- No concurrent role execution.
- Do not skip a role when its scope is applicable.
- Emit a short handoff artifact at each transition.
- If a role cannot proceed due to missing evidence, stop and request the missing evidence from tooling/research (not from the user by default).

## Skill mapping

- Manager: `role-manager-execution`
- Collaborator: `role-collaborator-execution`
- Admin: `role-admin-execution`
- Consultant: `role-consultant-critique`
- Orchestration: `role-baton-orchestrator`

## De-duplication boundary

- `operator-identity-context` defines authority and automation mandate.
- Role skills define per-role execution contracts.
- Domain skills (`repo-standards-router`, `workflow-self-anneal`, release/security/docs skills) remain source of truth for specialized procedures.
