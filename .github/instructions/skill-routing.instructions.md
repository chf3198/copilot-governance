---
applyTo: "**"
---

<!-- GLOBAL-SKILLS-MANAGED:START -->
Use repository and global customization layers together for every task:

1. Read .github/copilot-instructions.md first.
2. Apply nearest AGENTS.md instructions.
3. Prefer reusable global skills from ~/.copilot/skills before ad-hoc reasoning.
4. For every task, invoke `role-baton-orchestrator` first (Manager → Collaborator → Admin → Consultant).
5. For repository workflow routing, invoke:
   - `repo-standards-router` for task classification and gates
   - `openclaw-universal-system` as the machine-global OpenClaw baseline when OpenClaw might help
   - `network-platform-resources` when task could benefit from remote execution or offloading
   - `openclaw-availability-utilization` when OpenClaw lane is expected or preferred
   - `workflow-self-anneal` only for post-failure/process drift checks
5. Do not claim skill usage unless the skill was actually invoked and followed.
<!-- GLOBAL-SKILLS-MANAGED:END -->
