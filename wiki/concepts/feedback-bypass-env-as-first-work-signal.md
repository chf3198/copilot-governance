---
title: "Feedback: Bypass Env as First-Work Signal"
type: concept
created: 2026-05-20
updated: 2026-05-20
tags: [governance, anneal, self-anneal, bypass, session-ordering]
sources: []
related: ["[[distributed-self-anneal]]", "[[self-annealing]]", "[[andon-pull-protocol]]", "[[feedback-self-anneal-scope]]"]
status: active
---

# Feedback: Bypass Env as First-Work Signal

## Pattern

When a governance-gate bypass env var (`SKIP_CLOSEOUT_PREFLIGHT`, `PUSH_GATES_BYPASS`, etc.)
is used 2+ times in the same session, it is a reliable signal that an infrastructure
bug is actively blocking normal workflow — and that bug should be promoted to **first-work**
in the current session rather than worked around repeatedly.

## Anti-pattern this closes

The natural impulse when pre-flight surfaces a governance-gate bug is to set the bypass env
var and continue with the planned work. The bypass is a documented escape hatch, so each
individual use is sanctioned. The trap is cumulative: 6+ pushes with `SKIP_CLOSEOUT_PREFLIGHT=1`
were needed during the 2026-05-16 session before #1639 landed — every one bypassed a live
governance gate during governance Epic work.

## Decision rule

> If the same bypass env var is triggered ≥ 2 times in a session, stop. Promote
> the underlying bug-fix to first-work. File a ticket if none exists. Do not
> accumulate more bypasses.

## Enforcement

`scripts/global/session-bypass-tracker.js` counts per-session bypass invocations and emits
a Tier-2 anneal advisory on stderr when the threshold (2) is reached. The tracker is wired
into `scripts/global/pre-push-gates.js`.

## References

- Refs #1715 (shipped this feedback pattern)
- Refs #1639 (infrastructure bug that prompted the pattern)
- See `instructions/workflow-resilience.instructions.md` Tier-2 triggers
