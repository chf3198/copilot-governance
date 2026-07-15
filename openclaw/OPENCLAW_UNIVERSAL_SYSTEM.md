# OpenClaw Universal System

**Status**: Active machine-global standard
**Date**: 2026-04-10
**Scope**: All VS Code Copilot agent chats on this machine
**Goal**: Make OpenClaw strategy portable across repositories without losing project-specific overlays

---

## What This Solves

The original OpenClaw A+ plan was written inside one repository. That made it useful for TSV Ledger, but not automatically canonical for other projects. This universal system moves the shared strategy to `~/.copilot` so any project can inherit the same operating model.

## Canonical Global Assets

- Strategy: `/home/curtisfranks/.copilot/openclaw/OPENCLAW_UNIVERSAL_SYSTEM.md`
- Quick reference: `/home/curtisfranks/.copilot/openclaw/OPENCLAW_UNIVERSAL_QUICK_REF.md`
- Routing map: `/home/curtisfranks/.copilot/openclaw/task-router-profile-map.json`
- Skill entrypoint: `/home/curtisfranks/.copilot/skills/openclaw-universal-system/SKILL.md`
- Bootstrap command: `/home/curtisfranks/.local/bin/openclaw-bootstrap-repo`

## Bootstrap a Repository

Use the bootstrap command to connect any repository to the universal OpenClaw system:

- `global-skills-bootstrap-repo /absolute/path/to/repo init`
- `global-skills-bootstrap-repo /absolute/path/to/repo audit`

`init` creates a minimal overlay at `.github/instructions/openclaw-universal.instructions.md`.
`init` also updates or creates `.github/instructions/global-skills.instructions.md` so OpenClaw joins the repository's broader global-skills routing contract.
`audit` reports whether the repository already points to the global OpenClaw system and whether the wider global-skills contract includes it.

`openclaw-bootstrap-repo` remains as a compatibility wrapper and forwards to the higher-level bootstrap so there is one orchestration path.

## Universal Principles

1. **Global first**: Store reusable OpenClaw policy under `~/.copilot`, not inside a single repo.
2. **Repo overlays second**: Let each repository add implementation details, gates, and exceptions.
3. **Three checkpoints**: Evaluate OpenClaw at design, implementation, and verification.
4. **Task-aware routing**: Route by task type and complexity, not by habit.
5. **Observable decisions**: Keep enough evidence to explain lane choice and outcome.
6. **Portable defaults**: New projects should be able to adopt the system without copying TSV Ledger-specific docs.

## Universal Operating Model

### 1. Classify the task

Use the shared routing map to assign one task type:
- `code-generation`
- `analysis`
- `reasoning-advanced`
- `documentation`
- `testing`

### 2. Decide the lane

Prefer OpenClaw when one or more are true:
- the task is complex or multi-step
- the task touches multiple files or systems
- the task requires broad test runs or browser automation
- local memory pressure or latency would hurt execution
- the work benefits from better model diversity or failover

Prefer local when all are true:
- the change is tiny and isolated
- validation is narrow and fast
- no heavy reasoning or broad execution is required

### 3. Capture rationale

Record a concise rationale at each relevant checkpoint:
- task type
- selected lane
- confidence or complexity estimate
- why the alternative lane was not chosen

### 4. Verify in project context

Use the repository's own tests, lint rules, build checks, and release gates.

## Universal vs Repository Responsibilities

| Layer | Location | Responsibility |
|------|----------|----------------|
| Global policy | `~/.copilot/openclaw/` | Shared strategy, routing model, portability |
| Global skill | `~/.copilot/skills/openclaw-universal-system/` | Reusable activation + operating rules |
| Repo overlay | project `docs/` or instructions | Local gates, scripts, metrics, implementation specifics |
| Runtime scripts | local repo or `~/.copilot/scripts/` | Execution helpers and automation commands |

## Adoption Rule for New Projects

Any new project that wants OpenClaw optimization should:
1. Load `openclaw-universal-system`
2. Load `openclaw-availability-utilization`
3. Add only the repository-specific overlay needed for local gates and workflows
4. Avoid duplicating the universal policy unless the repo needs a tailored derivative

## Notes for TSV Ledger

TSV Ledger remains the first implementation overlay for this system. Its existing optimization docs should point back to this global canonical source while preserving the repo-specific execution roadmap.
