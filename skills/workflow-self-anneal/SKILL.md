---
name: workflow-self-anneal
description: Run a bounded self-annealing review of operating instructions and workflow outcomes. Use this after failures, after long sessions, before merge, or when repeated mismatches appear between intended process and observed execution.
argument-hint: [context: session-start|post-failure|pre-merge|post-release] [scope: workflow|stability|qa|git]
user-invocable: true
disable-model-invocation: false
---

# Workflow Self-Anneal

## Purpose

Perform a **controlled, auditable improvement pass** on instructions and process docs to reduce repeated failures while preserving human control.

This skill optimizes _process reliability_, not model internals.

## Hard safety constraints

1. No unbounded loops, recursive retries, or autonomous "improve forever" behavior.
2. Maximum one anneal pass per invocation.
3. Maximum three proposed documentation changes per invocation.
4. Do not claim deploy/publish/release success without explicit verification evidence.
5. Do not modify security/permission policy automatically; propose changes only.
6. If evidence is insufficient, return `NO_CHANGE` with missing-evidence requirements.

## Trigger conditions

Run this skill when any of the following is true:

- Same failure pattern appears at least twice in the last 7 days.
- Session had crash/restart/tooling instability.
- Instructions were contradicted by observed actions.
- Pre-merge gate requires process hardening evidence.
- Repeated carryover/blocked items appear across iterations.
- PR review or merge latency repeatedly breaches team targets.
- Reopened issues/defects trend upward.

## Input collection

Collect only relevant evidence for current scope:

- Recent execution artifacts (logs, errors, failing checks, screenshots, QA notes)
- Existing instructions and workflow docs
- Recent commits/PR notes if available

If required artifacts are unavailable, declare exactly what is missing and stop.

## Analysis protocol

1. **Detect mismatch**
   - Compare expected behavior from instructions vs observed behavior in evidence.
2. **Classify root cause**
   - One of: `ambiguity`, `missing guardrail`, `stale instruction`, `tool fragility`, `human override`.
3. **Assess recurrence risk**
   - `low`, `medium`, `high` based on frequency and blast radius.
4. **Detect Agile drift signals**
   - Check trend indicators (carryover, blocked age, review latency, reopen rate).
5. **Propose minimal fix**
   - Prefer smallest docs/workflow delta that prevents recurrence.
6. **Define verification gate**
   - Add objective checks that confirm the fix works.

## Output format (required)

Return exactly this structure:

```text
SELF_ANNEAL_REPORT
context: <session-start|post-failure|pre-merge|post-release>
scope: <workflow|stability|qa|git>

observation:
- ...

expected_behavior:
- ...

mismatch:
- ...

root_cause: <ambiguity|missing guardrail|stale instruction|tool fragility|human override>
risk: <low|medium|high>

drift_signals:
- metric: <carryover|blocked-age|review-latency|merge-latency|reopen-rate>
   trend: <improving|stable|degrading>
   evidence: <artifact reference>

proposed_changes:
1) file: <path>
   change_type: <add|edit|remove>
   rationale: <why this is minimal and sufficient>
   patch_summary: <short description>

verification_plan:
- check: <objective check>
  pass_condition: <measurable condition>

decision:
- <apply|defer|NO_CHANGE>

missing_evidence:
- <none or required artifacts>
```

## Change targeting guidance

When possible, prioritize these targets:

1. `docs/workflow/self-annealing.md`
2. `docs/workflow/learnings.md`
3. `docs/technical/system-stability.md`
4. `docs/workflow/skills/AGILE-METRICS-PLAYBOOK.md`
5. project-specific runbooks/checklists directly tied to failure mode

## Stop conditions

Stop immediately and return `NO_CHANGE` if:

- Proposed change cannot be validated objectively.
- Required evidence is missing.
- Change would expand permissions or bypass approval controls.
- The same recommendation was already applied and verified recently.

## Quality bar

A good anneal output is:

- **Specific**: references concrete behavior and artifacts
- **Minimal**: smallest viable guardrail update
- **Testable**: clear pass/fail checks
- **Traceable**: explicit rationale and risk classification
- **Trend-aware**: confirms drift is reduced across subsequent cycles

## Mandatory visual verification rule (publish/UX scope)

When scope includes UX-rendered changes (`qa` or `workflow` affecting UI):

1. Do not allow ticket closure or publish success claims from DOM/CI checks alone.
2. Require at least one post-change visual inspection artifact (Claude Vision or equivalent) from live/UAT.
3. Required pass evidence in `verification_plan`:
   - `check`: visual rendering integrity
   - `pass_condition`: primary hero/content sections visibly render, primary CTA visible, no major collapse/malformed layout
4. If evidence is missing, decision must be `NO_CHANGE` or `defer` with explicit missing artifact list.
