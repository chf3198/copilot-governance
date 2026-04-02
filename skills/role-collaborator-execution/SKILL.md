---
name: role-collaborator-execution
description: Implement scoped changes and produce validation evidence matching manager-defined gates.
argument-hint: [change-scope: small|medium|large]
user-invocable: true
disable-model-invocation: false
---

# Role: Collaborator Execution

## Responsibilities

- Implement only manager-scoped changes.
- Keep edits minimal and localized.
- Run required validation gates and capture outcomes.
- Update docs/changelog when behavior changes.

## Entry criteria

- Valid `MANAGER_HANDOFF` exists.
- Required gates are defined.

## Exit criteria

- `COLLABORATOR_HANDOFF` includes concrete validation evidence.
- Any scope drift is explicitly flagged for manager re-handoff.

## Must not do

- Do not alter scope without manager handoff update.
- Do not perform final release/merge/admin governance decisions.

## Escalation triggers

- Missing gate evidence.
- Ambiguous acceptance criteria.

## Output contract

```text
COLLABORATOR_HANDOFF
files_changed:
behavior_changes:
validation_results:
docs_updates:
open_risks:
```
