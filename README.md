<div align="center">

# 🧠 copilot-governance

**Platform-agnostic AI governance — any AI coding platform, any machine, any number of users**

[![CI](https://github.com/chf3198/copilot-governance/actions/workflows/validate-pr.yml/badge.svg)](https://github.com/chf3198/copilot-governance/actions/workflows/validate-pr.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![agentskills.io](https://img.shields.io/badge/skills-agentskills.io-blue)](https://agentskills.io)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)](https://github.com/chf3198/copilot-governance)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick Install](#-quick-install) · [How It Works](#-how-it-works) · [Self-Annealing](#-self-annealing) · [Skills Library](#-skills-library) · [Contributing](#-contributing)

</div>

---

## What This Is

Every AI coding session on every machine should follow the same high-quality protocols — the same engineering standards, the same GitHub workflow, the same security guards. This repo is that shared governance layer.

It installs in one command, self-updates every 15 minutes, and lets any machine's AI propose an improvement that — after your review — propagates everywhere. The architecture places **no limit on platforms, machines, or users**: any AI platform that reads a rules file and loads skills from a directory can be wired in with one `install.sh` stanza and a template file.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     ~/copilot-governance  (this repo)                    │
│                                                                          │
│  instructions/   skills/   agents/   hooks/   sync/                     │
└───────┬──────────────┬──────────────┬────────────────┬───────────────────┘
        │              │              │                │
        ▼              ▼              ▼                ▼
  ~/.copilot/    ~/.gemini/      ~/.claude/       ~/.yourplatform/
  (VS Code)   (Antigravity)   (Claude Code)     (any future platform)
  symlink       symlink +       symlink +         one stanza in
                @-imports       @-imports         install.sh
```

One repo. One `git pull`. All platforms live.

---

## 🚀 Quick Install

**Prerequisites (all platforms):** `git`, `bash`, `python3`
**For self-annealing PRs (one-time per machine):** [`gh` CLI](https://cli.github.com) installed and authenticated

**One command installs governance for every platform present on the machine:**

```bash
curl -fsSL https://raw.githubusercontent.com/chf3198/copilot-governance/main/install.sh | bash
```

The installer is fully idempotent — safe to re-run at any time. The pull timer installs itself and syncs from `main` every 15 minutes in the background.

After install, authenticate the GitHub CLI once so the AI can propose self-annealing PRs:

```bash
gh auth login
```

---

### Platform-Specific Setup & Verification

<details>
<summary>🖥️ VS Code Copilot</summary>

**Additional prerequisites:** [VS Code](https://code.visualstudio.com) with the GitHub Copilot extension installed.

**What the installer does:**
- Symlinks `~/.copilot/ → ~/copilot-governance/`
- Merges required keys into `~/.config/Code/User/settings.json`

**Verify it worked:**
```bash
# Confirm symlink
ls -la ~/.copilot   # should point to ~/copilot-governance

# Confirm settings keys were added
grep -c "chat.instructionsFilesLocations" ~/.config/Code/User/settings.json
# should print 1
```

Then in VS Code, open a new Chat session and ask:
> "What governance instructions are you operating under?"

It should enumerate `global-standards`, `github-governance`, and the other instruction files.

</details>

<details>
<summary>🌌 Google Antigravity</summary>

**Additional prerequisites:** [Google Antigravity](https://antigravity.google) installed (Linux glibc ≥ 2.28, macOS, or Windows). Available in Crostini on Chromebook.

**What the installer does:**
- Generates `~/.gemini/GEMINI.md` from the repo template, resolving `${REPO_DIR}` to the actual clone path
- Symlinks `~/.gemini/antigravity/skills/ → ~/copilot-governance/skills/`

**Verify it worked:**
```bash
# Confirm GEMINI.md was generated with resolved paths (no literal ${REPO_DIR})
grep "REPO_DIR" ~/.gemini/GEMINI.md && echo "ERROR: path not resolved" || echo "OK"

# Confirm the first @-import line looks correct
head -5 ~/.gemini/GEMINI.md

# Confirm skills symlink
ls -la ~/.gemini/antigravity/skills   # should point to ~/copilot-governance/skills
```

Then open an Antigravity session and ask:
> "What governance instructions are you operating under?"

It should enumerate the global-standards, github-governance, and other instruction files loaded via `~/.gemini/GEMINI.md`.

**Note on `@`-imports:** Antigravity's `GEMINI.md` format supports `@/absolute/path/file.md` syntax for importing external instruction files. The generated `~/.gemini/GEMINI.md` uses this to pull all 8 instruction files from the repo without copying them.

</details>

<details>
<summary>🤖 Claude Code</summary>

**Additional prerequisites:** [Claude Code](https://claude.ai/code) installed.

**What the installer does:**
- Generates `~/.claude/CLAUDE.md` from the repo template, resolving `${REPO_DIR}` to the actual clone path
- Symlinks `~/.claude/skills/ → ~/copilot-governance/skills/`

**Verify it worked:**
```bash
# Confirm CLAUDE.md was generated with resolved paths
grep "REPO_DIR" ~/.claude/CLAUDE.md && echo "ERROR: path not resolved" || echo "OK"

# Confirm skills symlink
ls -la ~/.claude/skills   # should point to ~/copilot-governance/skills
```

Then open a Claude Code session and ask:
> "What governance instructions are you operating under?"

</details>

<details>
<summary>➕ Adding a new platform</summary>

1. Create `YOURPLATFORM.md` in the repo root using the `${REPO_DIR}` placeholder pattern (see `GEMINI.md` as a reference)
2. Add a stanza to `install.sh` that runs `envsubst < YOURPLATFORM.md > ~/.yourplatform/rules.md` and symlinks `skills/`
3. Open a PR — no skill files need to change

</details>

---

## 🏗 How It Works

### Platform Support

The architecture is **platform-agnostic**. Any AI coding platform that supports file-based config can be wired in by adding one stanza to `install.sh`, a `${REPO_DIR}` template rules file, and a skills directory symlink. No skill files change — the [agentskills.io](https://agentskills.io) `SKILL.md` format is an open standard any platform can implement.

**Currently wired platforms:**

| Platform | Config Root | Skills | Rules / Instructions | Hooks |
|---|---|---|---|---|
| **VS Code Copilot** | `~/.copilot/` → repo symlink | `~/.copilot/skills/` | `~/.copilot/instructions/*.instructions.md` | `hooks/global-standards.json` |
| **Google Antigravity** | `~/.gemini/` | `~/.gemini/antigravity/skills/` → symlink | `~/.gemini/GEMINI.md` with `@`-imports | *(not yet documented)* |
| **Claude Code** | `~/.claude/` | `~/.claude/skills/` → symlink | `~/.claude/CLAUDE.md` with `@`-imports | `~/.claude/settings.json` hooks |
| **Any platform** | `~/.yourplatform/` | symlink → `skills/` | template rules file via `envsubst` | platform-specific |

**Adding a new platform:** create `YOURPLATFORM.md` template, add an `install.sh` stanza that runs `envsubst` and creates the skills symlink, open a PR. Skill files require zero changes.

### Repository Layout

```
copilot-governance/
├── install.sh                    ← one-command bootstrap, all platforms
├── GEMINI.md                     ← Antigravity rules template (${REPO_DIR} placeholder)
├── CLAUDE.md                     ← Claude Code instructions template
│
├── instructions/                 ← 8 always-on rules injected every session
│   ├── global-standards.instructions.md
│   ├── github-governance.instructions.md
│   ├── operator-identity-context.instructions.md
│   ├── role-baton-routing.instructions.md
│   ├── repo-health-onboarding.instructions.md
│   ├── release-docs-hygiene.instructions.md
│   ├── workflow-resilience.instructions.md
│   └── playwright-mcp-low-resource.instructions.md
│
├── skills/                       ← 25 on-demand expert skills (agentskills.io format)
│   ├── github-ops-excellence/
│   ├── github-ticket-lifecycle-orchestrator/
│   ├── workflow-self-anneal/
│   └── ...
│
├── agents/                       ← 4 specialized agents
│   ├── governance-auditor.agent.md
│   ├── release-reviewer.agent.md
│   ├── security-scanner.agent.md
│   └── planner.agent.md
│
├── hooks/                        ← lifecycle enforcement (VS Code Copilot)
│   ├── global-standards.json
│   └── scripts/
│       ├── session_context.py    ← SessionStart: inject machine context
│       ├── pretool_guard.py      ← PreToolUse: block dangerous ops
│       ├── posttool_reminders.py ← PostToolUse: governance reminders
│       └── stop_reminder.py      ← Stop: post-merge gate check
│
├── sync/                         ← sync automation
│   ├── pull.sh                   ← pulls from main (run by systemd timer)
│   ├── create-pr.sh              ← creates a draft PR for a self-annealed improvement
│   ├── governance-pull.service
│   └── governance-pull.timer
│
└── .github/
    └── workflows/
        └── validate-pr.yml       ← CI: validates SKILL.md + no secrets on every PR
```

---

## 🔄 Sync Architecture

### The PR-Based Approval Flow

The pull timer and GitHub PRs together create a zero-conflict, user-approved sync loop:

```mermaid
flowchart TD
    A["🤖 AI on any machine\nidentifies improvement"] --> B["AI edits skill or instruction file"]
    B --> C["AI runs sync/create-pr.sh\n--skill name --title ... --body ..."]
    C --> D["feat/anneal-skill-date branch\ncreated and pushed to GitHub"]
    D --> E["📋 Draft PR opens\nCI validate-pr.yml runs"]
    E --> F{CI passes?}
    F -- No --> G["❌ PR blocked\nfix and push again"]
    F -- Yes --> H["👤 User reviews diff\nin GitHub"]
    G --> E
    H --> I{Approve?}
    I -- "Edit + Approve" --> J["Merge to main ✅"]
    I -- Reject --> K["Close PR — no change propagates"]
    J --> L["⏱ Pull timer fires\n≤15 min on all machines"]
    L --> M["git merge --ff-only origin/main"]
    M --> N["🔗 Symlinks live immediately\nNo IDE restart needed"]

    style A fill:#4a90d9,color:#fff
    style J fill:#27ae60,color:#fff
    style K fill:#e74c3c,color:#fff
    style N fill:#27ae60,color:#fff
```

### Multi-Machine Sequence

```mermaid
sequenceDiagram
    participant M1 as Machine A (any platform)
    participant M2 as Machine B (any platform)
    participant MN as Machine N (any platform)
    participant GH as GitHub main

    Note over M1,GH: Automatic pull cycle every 15 min — all machines
    M1->>GH: git fetch + merge --ff-only origin/main
    M2->>GH: git fetch + merge --ff-only origin/main
    MN->>GH: git fetch + merge --ff-only origin/main

    Note over M1,GH: AI on Machine A self-anneals a skill
    M1->>GH: create-pr.sh → feat/anneal-X branch + draft PR
    Note over GH: User reviews and approves PR
    GH->>GH: Merge feat/anneal-X → main

    Note over M2,GH: All other machines receive it on next pull cycle
    M2->>GH: git fetch + merge --ff-only origin/main
    GH-->>M2: Updated skill delivered via symlink instantly
    MN->>GH: git fetch + merge --ff-only origin/main
    GH-->>MN: Updated skill delivered via symlink instantly
```

### Why Conflicts Cannot Occur

Machines **never push directly to `main`**. Every change flows through a named PR that the user approves. The pull timer only does `--ff-only` — a local clone either fast-forwards cleanly or surfaces a warning for manual triage. There is no push daemon, no auto-merge bot, no race condition.

---

## ✨ Self-Annealing

Self-annealing is the system's ability to improve its own global-items. When an AI session discovers a better protocol — a more precise skill, a tighter guard, a clearer instruction — it proposes the change formally through a PR.

```mermaid
flowchart LR
    subgraph machine ["This Machine"]
        A["AI identifies\nimprovement"] --> B["Edits skill\nor instruction"]
        B --> C["sync/create-pr.sh\n--skill name\n--title ...\n--body ..."]
    end
    subgraph github ["GitHub"]
        C --> D["Draft PR\n+ CI validation"]
        D --> E["👤 User approves\nand merges"]
    end
    subgraph others ["All Other Machines"]
        E --> F["Pull timer\n≤ 15 min"]
        F --> G["Symlink live\nimmediately"]
    end

    style E fill:#27ae60,color:#fff
    style G fill:#27ae60,color:#fff
```

**Invoking it manually:**

```bash
bash ~/copilot-governance/sync/create-pr.sh \
  --skill workflow-self-anneal \
  --title "Tighten pre-merge gate for missing CHANGELOG entries" \
  --body "Root cause: check wasn't catching omissions for patch releases.
Change: added patch-release condition to gate logic.
Evidence: 3 recent merges passed without CHANGELOG entries."
```

**The user is the approval gate.** Nothing reaches other machines without an explicit merge.

---

## 📚 Skills Library

Skills are on-demand expert procedures. All 25 follow the [agentskills.io](https://agentskills.io) open standard — the same `SKILL.md` file works on every supported platform without modification. Adding a platform does not require changing any skill.

**Invoke any skill by name:**
```
invoke `github-ticket-lifecycle-orchestrator` skill
invoke `workflow-self-anneal` skill with context: post-failure
invoke `release-version-integrity` skill
```

### GitHub Operations

| Skill | Purpose |
|---|---|
| `github-ops-excellence` | Expert GitHub policy profiles and control catalogs |
| `github-ops-tree-router` | Routes GitHub requests through a capability-first skill tree |
| `github-ticket-lifecycle-orchestrator` | End-to-end ticket: create → branch → PR → merge → closeout |
| `github-review-merge-admin` | Review gates, required checks, merge queue readiness |
| `github-ruleset-architecture` | Repository and org ruleset design and audit |
| `github-actions-security-hardening` | Least-privilege tokens, pinned actions, supply-chain controls |
| `github-capability-resolver` | Resolves feature availability by plan and repo settings |
| `github-projects-agile-linkage` | Agile linkage in GitHub Projects — issue types, automations |
| `github-release-incident-flow` | Release readiness, rollback evidence, hotfix linkage |

### Repository Health

| Skill | Purpose |
|---|---|
| `repo-onboarding-standards` | Onboard any repo into Copilot + CI governance baseline |
| `repo-profile-governance` | Audit community health, metadata, contribution surfaces |
| `repo-standards-router` | Classify repo by app type → correct standards branch |
| `repo-structure-conventions` | File organization, naming conventions, project layouts |
| `docs-drift-maintenance` | Detect and remediate documentation drift after code changes |
| `release-version-integrity` | Validate release metadata across tags, manifests, changelogs |
| `secret-exposure-prevention` | Prevent secret leakage in git history, artifacts, logs, docs |

### Role Execution

| Skill | Purpose |
|---|---|
| `role-baton-orchestrator` | Orchestrates Manager → Collaborator → Admin → Consultant handoff |
| `role-manager-execution` | Scopes changes, defines acceptance criteria and verification gates |
| `role-collaborator-execution` | Implements scoped changes and produces validation evidence |
| `role-admin-execution` | Git / PR / release ops and runtime controls |
| `role-consultant-critique` | Independent post-execution critique and risk scoring |

### Platform / Environment

| Skill | Purpose |
|---|---|
| `operator-identity-context` | Establishes operator identity and execution mandate |
| `playwright-vision-low-resource` | Low-resource Playwright + Vision profile for constrained machines |
| `mem-watchdog-ops` | Crostini memory watchdog — triage, log interpretation, tuning |
| `workflow-self-anneal` | Bounded self-annealing review of instructions and workflow outcomes |

---

## 🪝 Lifecycle Hooks

Hooks enforce governance automatically at the session level — no invocation needed.

```mermaid
flowchart LR
    A["Session\nOpens"] -->|SessionStart| B["session_context.py\nInject machine context\nDetect repo signals"]
    B --> C["💬 AI Chat"]
    C -->|PreToolUse| D["pretool_guard.py\nBlock: rm -rf /\nBlock: .env writes\nBlock: *.key ops"]
    D --> E["Tool\nRuns"]
    E -->|PostToolUse| F["posttool_reminders.py\nGovernance reminders\nChecklist triggers"]
    F --> C
    C -->|Stop| G["stop_reminder.py\nCHANGELOG?\nREADME sync?\n6 post-merge gates?"]

    style D fill:#e74c3c,color:#fff
    style G fill:#f39c12,color:#fff
```

---

## 🎭 Role Execution Model

Non-trivial tasks use a single-thread baton handoff. At most one role is active at a time.

```mermaid
flowchart LR
    U["👤 User\nClient"]
    M["🗂 Manager\nScope + gates"]
    C["⚒ Collaborator\nImplement"]
    A["⚙ Admin\nGit / PR / release"]
    Q["🔍 Consultant\nCritique + risk"]

    U -- "design / UAT only" --> M
    M -- "handoff artifact" --> C
    C -- "handoff artifact" --> A
    A -- "handoff artifact" --> Q
    Q -- "findings" --> U

    style U fill:#9b59b6,color:#fff
    style M fill:#3498db,color:#fff
    style C fill:#27ae60,color:#fff
    style A fill:#e67e22,color:#fff
    style Q fill:#e74c3c,color:#fff
```

The user is consulted only for design decisions and UAT sign-off. The AI executes all other steps.

---

## 🤝 Contributing

Improvements from any source are welcome. This is a public governance library.

### Adding a New Skill

1. Fork and create a branch: `feat/<issue-number>-<skill-name>`
2. Create `skills/<skill-name>/SKILL.md` following the [agentskills.io](https://agentskills.io) format:

```yaml
---
name: your-skill-name
description: One sentence — what it does and when to use it.
argument-hint: [key parameter hints]
user-invocable: true
disable-model-invocation: false
---

# Your Skill Name

## Purpose
...
```

3. Open a PR — CI validates frontmatter and scans for secrets automatically
4. PR body should include: what the skill does, what problem it solves, evidence of effectiveness

### Conventions

| Item | Convention |
|---|---|
| PR / commit titles | Conventional Commits — `feat(skill): add X` · `fix(instruction): correct Y` |
| Branch naming | `feat/<number>-<slug>` or `fix/<number>-<slug>` |
| Issue titles | Plain imperative ≤72 chars — no `[TAG]` brackets |
| Secrets | Never in repo — CI rejects PRs containing credential patterns |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

---

## 🔒 Security

- API keys live per-machine in VS Code's secure credential storage — **never** in repo files
- `pretool_guard.py` blocks all AI operations touching `.env`, `*.pem`, `*.key`, and related files
- CI scans every PR for AWS key patterns, GitHub PATs, OpenAI keys, and Slack tokens
- `.gitignore` blocks common secret file extensions at the repo level

Found a security issue? Please use a [private security advisory](https://github.com/chf3198/copilot-governance/security/advisories/new) rather than a public issue.

---

## 📋 Post-Merge Checklist

After every PR that changes user-facing behavior, the AI gate-checks all six items before marking complete:

| # | Gate | When Required |
|---|---|---|
| 1 | CHANGELOG entry | Every behavioral change |
| 2 | README sync | User-visible behavior changed |
| 3 | `repo-profile-governance` skill | Community health files, metadata |
| 4 | `docs-drift-maintenance` skill | Any code or config change |
| 5 | `docs/workflow/learnings.md` | Significant discovery made |
| 6 | `release-version-integrity` skill | Package or extension behavior changed |

---

## License

[MIT](LICENSE) — use freely, contributions welcome.
