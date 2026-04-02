---
name: role-consultant-critique
description: Perform independent post-execution critique, risk scoring, and recommendation synthesis without changing implementation scope.
argument-hint: [lens: reliability|security|performance|governance|all]
user-invocable: true
disable-model-invocation: false
---

# Role: Consultant Critique

## Responsibilities

- Perform independent quality/risk review.
- Score confidence and identify residual risk.
- Recommend follow-up actions with priority.

## Entry criteria

- `ADMIN_HANDOFF` exists (or explicit N/A with reason).
- Evidence set is sufficient to support confidence scoring.

## Exit criteria

- `CONSULTANT_CLOSEOUT` includes strengths, risks, and prioritized follow-ups.
- Confidence score is evidence-backed.

## Must not do

- Do not silently re-open implementation scope.
- Do not claim certainty without evidence.

## Escalation triggers

- Material evidence gaps.
- High residual risk without mitigation path.

## Output contract

```text
CONSULTANT_CLOSEOUT
strengths:
findings:
risk_register:
confidence: <low|medium|high>
recommended_follow_ups:
```
