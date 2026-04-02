# Workflow Learnings

Significant discoveries, root-cause findings, and process improvements made during active sessions.
Add an entry whenever a non-obvious insight changes how tasks are approached.

Format: date, what was discovered, what changed as a result.

---

## 2026-04

### Self-annealing requires a discrete PR, not a push daemon
**Discovery:** An automatic push daemon (blind commit + push on file change) defeats the user-approval requirement for self-annealing improvements. There is no meaningful difference between an AI pushing directly to `main` and a push daemon doing it — both bypass review.

**Root cause:** Initial architecture conflated two categories of change: (1) personal config drift (which should stay local) and (2) intentional skill improvements that benefit all machines (which require user review and approval before propagating).

**Change:** Dropped push daemon entirely. Self-annealing now creates a named `feat/anneal-<skill>-<date>` branch + draft PR via `sync/create-pr.sh`. User reviews the specific diff, approves, and it merges to `main`. All other machines receive it on the next 15-minute pull cycle.

---

### GitHub PR is the approval mechanism, not extra infrastructure
**Discovery:** We were designing a separate "approval gateway" on top of the standard GitHub PR model. But GitHub PRs already provide: diff visibility, conversation, CI gate, user-approval requirement, and conflict prevention (via `--ff-only` pulls from protected `main`).

**Change:** The entire sync architecture reduced to two simple scripts: `create-pr.sh` (propose) and `pull.sh` (receive). No custom merge bot, no machine branches, no webhook server.

---

### Machine branches pollute a public repository
**Discovery:** `machine/<hostname>` branches would expose machine hostnames, user paths, and local config state in a public repo — both a privacy concern and a signal-to-noise problem for contributors.

**Change:** Machines never push branches to `origin` except via the explicit `create-pr.sh` flow, which creates named improvement branches only when an actual skill improvement warrants it.

---

### Antigravity config is file-based, not extension-based
**Discovery:** Google Antigravity has no extension marketplace. Global rules are in `~/.gemini/GEMINI.md` using `@`-import syntax. Global skills are loaded from `~/.gemini/antigravity/skills/`.

**Impact:** No per-platform variants of skill files are needed. The same `SKILL.md` agentskills.io format works on VS Code Copilot, Claude Code, and Antigravity — the install path is the only variable. `install.sh` handles all three with symlinks.
