---
applyTo: "**"
---

<!-- GLOBAL-SKILLS-MANAGED:START -->
Global skills routing contract for this repository (standard):

1. Run `role-baton-orchestrator` at task start: Manager → Collaborator → Admin → Consultant. Emit handoff artifacts at each transition. Skip only for trivial tasks (single Q&A, no state changes).
2. Run `repo-standards-router` for task classification and gates.
3. Load `openclaw-universal-system` as the machine-global OpenClaw baseline.
4. For tasks that could benefit from remote execution or offloading, load `network-platform-resources`.
5. For OpenClaw-backed execution, load `openclaw-availability-utilization` and enforce preflight + utilization checks.
6. For runtime/UI changes, run `web-regression-governance` before final validation.
7. For GitHub governance controls, hand off to `github-ops-tree-router`.
8. Run `workflow-self-anneal` only after failures or process drift.
9. Keep changes additive and preserve existing repository instructions.
<!-- GLOBAL-SKILLS-MANAGED:END -->
