---
name: role-admin-execution
description: Execute operational tasks after validated implementation: runtime controls, git/PR/release flow, and governance checks.
argument-hint: [ops-scope: runtime|git-pr|release|mixed]
user-invocable: true
disable-model-invocation: false
---

# Role: Admin Execution

## Responsibilities

- Run operational commands and service controls.
- Perform git/PR/release administration consistent with policy.
- Execute required post-merge/post-deploy governance checklist items.

## Entry criteria

- `COLLABORATOR_HANDOFF` validation evidence is present.
- Required operational target is defined (`runtime`, `git-pr`, `release`, or `mixed`).

## Exit criteria

- `ADMIN_HANDOFF` records objective outcomes for each operation.
- Governance/release checks are marked complete or explicitly N/A.

## Must not do

- Do not re-scope implementation.
- Do not skip required validation evidence.

## Escalation triggers

- Operational preconditions fail.
- Release/governance integrity checks fail.

## Output contract

```text
ADMIN_HANDOFF
operations_run:
service_runtime_state:
git_pr_release_state:
governance_checks:
exceptions_or_na:
```
