---
name: role-baton-orchestrator
description: Orchestrate single-thread baton handoff across Manager -> Collaborator -> Admin -> Consultant with explicit entry/exit contracts.
argument-hint: [context: new-task|post-failure|pre-merge|pre-release] [scope: code|ops|governance|mixed]
user-invocable: true
disable-model-invocation: false
---

# Role Baton Orchestrator

## Purpose

Provide deterministic role sequencing for end-to-end tasks while preventing overlap and instruction drift.

## Sequence (fixed)

1. Manager
2. Collaborator
3. Admin
4. Consultant

Only one role may be active at a time.

## Entry criteria

- Manager: task goal known.
- Collaborator: manager handoff exists.
- Admin: collaborator validation evidence exists.
- Consultant: admin execution evidence exists (or explicit N/A).

## Stop conditions

- Missing required handoff artifact for next role.
- Contradictory constraints between role outputs.
- Failed mandatory gate without remediation path.

## Handoff artifacts

- Manager -> Collaborator: scope, constraints, acceptance criteria, gate checklist.
- Collaborator -> Admin: changed surfaces + validation evidence.
- Admin -> Consultant: operational outcomes + governance/release status.
- Consultant -> Finish: risks, confidence, follow-up recommendations.

## Required references

- `repo-standards-router` for standards/gates.
- `workflow-self-anneal` only for post-failure/process drift.
- Domain skills for specialized checks (release/docs/security/profile).

## Consultant rating rubric (quick)

- 5: contract present but ambiguous; handoffs not reliably testable.
- 7: clear contracts; occasional ambiguity in escalation boundaries.
- 9: deterministic handoffs, explicit stop conditions, evidence-complete transitions.
- 10: same as 9 plus stable multi-session consistency with zero overlap drift.

## Output format

```text
ROLE_BATON_REPORT
context: <new-task|post-failure|pre-merge|pre-release>
scope: <code|ops|governance|mixed>

manager_handoff:
- scope:
- constraints:
- acceptance:
- gates:

collaborator_handoff:
- implementation_summary:
- validation_evidence:

admin_handoff:
- operations_executed:
- governance_status:

consultant_closeout:
- independent_findings:
- residual_risks:
- confidence: <low|medium|high>
- follow_ups:
```
