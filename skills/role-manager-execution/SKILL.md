---
name: role-manager-execution
description: Define scope, constraints, acceptance criteria, and verification gates before implementation begins.
argument-hint: [task-type: feature|bugfix|refactor|governance] [risk: low|medium|high]
user-invocable: true
disable-model-invocation: false
---

# Role: Manager Execution

## Responsibilities

- Clarify objective and non-objectives.
- Identify constraints from instructions and repository policy.
- Define objective acceptance criteria.
- Select required gates/tests/checks.

## Entry criteria

- Task intent is known.
- Repository instruction overlays are available.

## Exit criteria

- `MANAGER_HANDOFF` is complete and testable.
- Scope boundaries are explicit enough for implementation without reinterpretation.

## Must not do

- Do not implement code changes.
- Do not perform release/merge/admin operations.

## Escalation triggers

- If scope expands materially, regenerate `MANAGER_HANDOFF` before collaborator work continues.

## Required integrations

- Route standards with `repo-standards-router`.
- Use `workflow-self-anneal` only if post-failure/process drift applies.

## Output contract

```text
MANAGER_HANDOFF
objective:
non_objectives:
constraints:
acceptance_criteria:
required_gates:
planned_change_surfaces:
risk_class:
```
