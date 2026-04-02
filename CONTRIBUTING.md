## Contributing to copilot-governance

Thank you for taking the time to contribute. This is a public governance library — improvements to skills, instructions, agents, and hooks from any source are welcome.

---

## Before You Start

Every change requires a linked issue. Open one first:

- **Issue title**: plain imperative ≤72 chars — no `[TAG]` prefix, no `type(scope):` prefix
- **Labels**: apply `type:feat`, `type:fix`, or `type:docs` plus a `priority:*` label
- **Description**: what problem are you solving, and what is your proposed approach?

---

## Workflow

1. **Fork** the repository
2. **Create a branch** off `main`:
   ```
   feat/<issue-number>-<short-slug>
   fix/<issue-number>-<short-slug>
   docs/<issue-number>-<short-slug>
   ```
3. **Make your change** (see type-specific guidance below)
4. **Open a PR** — CI runs automatically on every PR targeting `main`
5. **PR title**: must follow Conventional Commits:
   ```
   feat(skill): add X
   fix(instruction): correct Y
   docs(readme): update Z
   ```
6. **PR body**: describe what changed, why, and any evidence of effectiveness

---

## Adding a New Skill

Skills must follow the [agentskills.io](https://agentskills.io) open standard so they work on VS Code Copilot, Claude Code, and Google Antigravity without modification.

### Required structure

```
skills/<skill-name>/
└── SKILL.md
```

### Required frontmatter

```yaml
---
name: your-skill-name
description: One sentence — what the skill does and when to use it.
argument-hint: [optional: key parameter names and values]
user-invocable: true
disable-model-invocation: false
---

# Your Skill Name

## Purpose

## When to Use

## Procedure

## Output Contract
```

**CI will reject your PR if `name:` or `description:` are missing from the frontmatter.**

---

## Editing an Existing Skill

- Keep changes minimal and localized
- If you're improving the skill based on observed real-world outcomes, say so in the PR body
- If the change is a self-annealing improvement, use `sync/create-pr.sh` rather than opening a PR manually

---

## Editing Instructions

Instructions live in `instructions/*.instructions.md`. They are injected into every AI session unconditionally — keep them concise and high-signal.

---

## Adding an Agent

Agents live in `agents/*.agent.md`. Follow the existing agent format (frontmatter with `name`, `description`, `model`, `tools`).

---

## CI Checks

All PRs targeting `main` must pass:

1. **SKILL.md frontmatter** — `name:` and `description:` required in all skill files
2. **Non-empty instructions** — all `.instructions.md` files must be non-empty
3. **No secret patterns** — AWS keys, GitHub PATs, OpenAI keys, Slack tokens are rejected

---

## Conventions

| Item | Rule |
|---|---|
| Commit messages | Conventional Commits: `feat(scope): description` |
| Branch names | `feat/<number>-<slug>` or `fix/<number>-<slug>` |
| Issue titles | Plain imperative ≤72 chars |
| Secrets | Never in repo files — use placeholders |
| Docs | Ship with the behavior change — never as a follow-up |

---

## Code of Conduct

Be constructive. Be specific. Prefer root-cause fixes over band-aids. Changes should be minimal, localized, and reversible.
