---
name: Workflow Resilience
description: Always-on rules for self-annealing after failures, documentation drift detection, and process hardening. Distilled from workflow-self-anneal and docs-drift-maintenance skills.
applyTo: "**"
---
# Workflow Resilience

## Self-annealing triggers

Run `workflow-self-anneal` skill when any of these conditions is true:
- Same failure pattern appears at least twice in the last 7 days.
- Session had crash, restart, or tooling instability.
- Instructions were contradicted by observed actions.
- Pre-merge gate requires process hardening evidence.
- Repeated carryover or blocked items across iterations.
- PR review or merge latency repeatedly breaches targets.
- Reopened issues or defects trend upward.

## Self-annealing constraints

- Maximum one anneal pass per invocation.
- Maximum three proposed documentation changes per invocation.
- Never auto-modify security or permission policy — propose changes only.
- If evidence is insufficient, return `NO_CHANGE` with missing-evidence requirements.
- No unbounded loops, recursive retries, or autonomous "improve forever" behavior.

## Self-annealing protocol

1. Detect mismatch between expected behavior (from instructions) and observed behavior (from evidence).
2. Classify root cause: `ambiguity`, `missing guardrail`, `stale instruction`, `tool fragility`, or `human override`.
3. Assess recurrence risk: `low`, `medium`, or `high`.
4. Propose minimal docs/workflow delta that prevents recurrence.
5. Define objective verification gate confirming the fix works.

