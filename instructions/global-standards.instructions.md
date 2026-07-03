---
name: Global Engineering Standards
description: Always-on standards for root-cause fixes, evidence-based claims, secret hygiene, and automation-first execution.
applyTo: "**"
---
# Global Engineering Standards

## Ticket-first governance

- No code or config work without a linked GitHub issue (ticket-first gate).
- Every commit message must reference `#N` (issue number). **IT-ops bypass (#2142)**: maintenance commits that touch tracked files but don't warrant Agile baton workflow (model pulls, fleet config updates, local-only environment changes) may set env var `MEGINGJORD_IT_OPS=1`, include literal `[it-ops]` in the commit subject, OR use `chore(it-ops):` Conventional-Commits prefix. The bypass emits an `allow` advisory naming the matched marker (not silent). IT role scope, boundary, and auto-auth contract: `skills/role-it-execution/SKILL.md` (#2318).
- Branch naming: `<type>/<issue#>-<slug>` (e.g., `feat/62-multi-ticket-baton`).
- Research tickets skip branching; findings posted as ticket comments.
- Pull latest `main` into feature branch before creating PR.

## Engineering standards

- Prefer root-cause fixes over detection-only band-aids.
- Prefer prevention over reaction: local guardrails first, CI backstops second.
- Never claim build, test, release, or publish success without explicit evidence.
- Keep changes minimal, localized, and reversible.
- Preserve public APIs unless change scope explicitly requires API updates.
- When behavior or interfaces change, update documentation in the same change.
- Never expose secrets in repository files, packaged artifacts, logs, or generated examples.
- Before packaging/publishing, verify exclude rules block secret-bearing files.
- Use placeholders in docs and examples — never live tokens, keys, or credentials.
- For versioned artifacts, enforce version consistency (tag = manifest = changelog).
- Use deterministic checks and objective pass/fail gates whenever possible.
- If evidence is incomplete, state uncertainty and gather missing evidence.

## Deferred-finalize merge-evidence contract (Epic #2295 P1.3)

PR bodies MUST include merge evidence for their linked issue. Two accepted forms:

- **Preferred** — `merge-evidence-deferred-final: #N`: satisfies `merge-evidence-pr-gate`
  WITHOUT triggering GitHub auto-close on merge. Consultant retains explicit terminal-finalize
  authority and closes the issue via `gh issue close #N` after posting `CONSULTANT_CLOSEOUT`.
- **Backward-compat** — `Closes #N` (or `Fixes #N` / `Resolves #N`): still accepted; triggers
  GitHub auto-close on merge. Use only when Consultant-explicit-close is not required.

Carve-out rationale: the deferred-finalize form resolves the PR-template vs merge-evidence-gate
conflict (template says "use Refs, not Closes"; gate previously required Closes). Registry entry:
`governance-carve-outs/index.md` entry `closes-vs-refs-deferred-final-carveout`.

## Admin-merge bypass exception (Epic #2517)

An `--admin` / branch-protection-bypass merge (a PR merged without all required checks green or
required review met) MUST carry a formal exception, else it is a G1 governance violation:
a `merge-bypass:admin-exception` label on the linked issue, OR a `BLOCKER_NOTE` in the PR body
with `bypass_reason:` and `approver:` fields. Enforced post-merge by `merge-bypass-gates.yml`
(`scripts/global/megalint/admin-merge-exception.js`). Relatedly, a multi-close PR that closes
any issue **as cancelled** requires a per-issue `CANCELLATION: <reason>` comment
(`batch-cancel-evidence.js`); batch completions keep the `resolved as part of batch with #N` form.

## Goal-lens decision lint (required)

- Apply this priority order to all governed decisions:
	`G1 Governance > G2 Quality > G3 Zero Cost > G4 Privacy & Security > G5 Portability > G6 Resilience > G7 Throughput > G8 Observability > G9 Interoperability > G10 Maintainability`.
- **Operator autonomy (cross-cutting, always-on principle — Epic #3391, not a ranked goal):** resolve
	reversible / low-risk decisions autonomously (free cross-model panel, never a bare client prompt);
	reach the human only at the 4 retained carve-outs (design / UAT / irreversible / security-weakening,
	per `config/retained-human-touchpoints.json`); autonomy is HARD-subordinate to C-G1 (Governance) and
	C-G4 (Privacy & Security); log the autonomy-vs-escalate decision (G8).
- When tradeoffs occur, explicitly justify why a lower-priority goal overrides a higher one.
- Keep the justification short and evidence-based in ticket comments, PR body, or closeout notes.

## Canonical-main checkout policy (#2107)

The main checkout (`${HOME}/devenv-ops/`) is canonical-only during sessions. Per Epic #2091 Phase-0 synthesis (`wiki/wisdom/project/research/harness-state-isolation.md` Fix #3):

- **Writes permitted**: ONLY to paths matching `.gitignore` patterns (per-operator config: `.env`, `.env.local`, `.envrc`, `.npmrc`; tooling artifacts: `node_modules`, `dist`, `.cache`, `tmp`, `.dashboard`, `.log4brains`, etc.)
- **Writes rejected**: tracked files (the codebase); branch switches off `main`; commits; `git stash` on tracked changes; `git worktree add` inside main checkout's working tree
- **Enforcer**: `hooks/scripts/canonical_main_enforcer.py` invoked by `pretool_guard.py` (rejects deny-decision with redirect-to-worktree message)

**Worktree pattern**: all team work happens in `${HOME}/devenv-ops-<team-or-ticket>/` worktrees. The main checkout is a canonical reference, not a workspace.

**2026 secrets caveat**: industry is migrating secrets out of `.env` toward workload-identity (Bitwarden Secrets Manager, Infisical, Zylos). As Megingjord adopts a secrets manager, the `.gitignore`-allowlist should narrow.

**Sync-direction trap (#2355)**: `scripts/sync.sh` copies `~/.copilot/ -> checkout` (the inverse of `scripts/deploy.sh`). Running it from canonical main while `~/.copilot/` is stale silently regresses tracked files to pre-merge content (root cause of #2355: 16 files reverted at 2026-05-27 22:14:10 across a single sync run, undoing merged PRs #2304 + #2308). The enforcer at `canonical_main_enforcer.py` intercepts Claude Code Edit/Write tool invocations but does NOT see shell-level `cp`/`rsync` inside script bodies. The shell-script blind spot is closed for `sync.sh` specifically: when invoked from canonical main without `--allow-canonical-write`, it exits 2, emits a v3 incident to `~/.megingjord/incidents.jsonl` (pattern_id `sync-sh-reverse-direction-regresses-main`), and prints a redirect to `npm run deploy:apply` (forward direction) or a worktree (for genuine inverse-reload use). Other inverse-direction scripts must adopt the same guard pattern; the blind spot is closed PER-SCRIPT, not class-wide. Coverage: `tests/sync-canonical-main-refuse.spec.js` (6 cases: refuse / JSONL-emit / override-dry-run / override-real-write / worktree / dry-run).

## Cross-team GitHub tool surface

- Default to the official GitHub MCP server (`github/github-mcp-server`) for
	cross-team GitHub interactions. Falls back to `gh` CLI when MCP unavailable
	or when `MEGINGJORD_MCP_DISABLED=1` is set.
- See `instructions/github-governance.instructions.md` for the full contract
	and `docs/howto/mcp-server-adoption.md` for the operator guide.

## Decisional vs. actionable (Discussions vs. Issues)

- **Issues**: actionable work with concrete deliverable + acceptance criteria.
- **Discussions**: decisional questions, open design exploration, cross-team
	protocol debates, tooling research — anything without a concrete AC yet.
- When a Discussion crystallizes into a deliverable, convert it to an Issue
	via `gh discussion view N --json` + `gh issue create`. Keep the Discussion
	link in the Issue body so decisional rationale is preserved.
- See `docs/howto/discussions-vs-issues.md` for category catalog and examples.
