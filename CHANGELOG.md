# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Commit and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/).

---

## [Unreleased]

## [1.0.0] - 2026-04-03

### Refactored
- `instructions/`: Consolidated `operator-identity-context` / `role-baton` duplication, centralized docs drift to `release-docs-hygiene`, shifted OpenSSF security rules to `github-governance`, fixed legacy `.copilot` paths, and softened dangling specialist skill references.

### Added
- `sync/create-pr.sh` — AI-invocable script to propose a self-annealed improvement as a draft GitHub PR for user review before any change propagates to other machines
- `sync/pull.sh` — `--ff-only` pull from `origin/main`, run by systemd user timer every 15 minutes
- `sync/governance-pull.service` + `sync/governance-pull.timer` — systemd user units that keep every machine current without manual intervention
- `GEMINI.md` — template file (with `${REPO_DIR}` placeholder) that `install.sh` processes into `~/.gemini/GEMINI.md` for Google Antigravity; imports all instruction files via `@`-import syntax
- `CLAUDE.md` — template file processed into `~/.claude/CLAUDE.md` for Claude Code
- `.github/workflows/validate-pr.yml` — CI workflow validating SKILL.md frontmatter, non-empty instruction files, and absence of secret patterns on every PR targeting `main`
- `CONTRIBUTING.md` — full contributor guide: skill format, branch naming, CI gates, conventions
- `LICENSE` — MIT

### Changed
- `README.md` — full rewrite: cross-platform scope, Mermaid architecture diagrams, self-annealing flow, complete skills library, hooks diagram, role execution model, contributing guide, security policy, post-merge checklist
- `.github/copilot-instructions.md` — updated to reflect PR-based approval architecture; removed machine-branch and auto-merge-bot design; added `envsubst` template pattern for `GEMINI.md`/`CLAUDE.md`

### Removed
- Machine-branch auto-push design (`machine/<hostname>` branches, push daemon, `machine-sync.yml` workflow) — replaced by PR-based approval model
