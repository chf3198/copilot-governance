---
name: GitHub Governance
description: Always-on GitHub governance rules for ticket lifecycle, review/merge gates, Actions security, project linkage, and release flow. Distilled from 9 specialized GitHub skills.
applyTo: "**"
---
# GitHub Governance

## Issue titles — plain imperative (never Conventional Commits)

- Issue titles are plain imperative sentences ≤72 chars: `Fix header nav contrast on dark backgrounds`
- **No** `type(scope):` prefix on issues — that belongs on commits/PRs only.
- **No** bracket tags (`[BUG]`, `[P1]`), parallel IDs (`TICKET-NNN`), or type duplication when a `type:*` label exists.
- GitHub `#N` is the sole canonical ticket identifier. No parallel local ID schemes.

## Commits and PR titles — Conventional Commits

- Format: `type(scope): imperative description` ≤72 chars.
- Allowed types: `feat` `fix` `chore` `content` `perf` `refactor` `docs` `style` `test`.
- Branch naming: `<type>/<issue-number>-<short-slug>` (e.g. `fix/5-nav-contrast`).

## Ticket lifecycle gates

- Every change needs a linked issue with taxonomy label (`type:*`), priority label, domain label, milestone, and project assignment before coding starts.
- PR requires `Closes #N`, milestone, labels, and gate-suite evidence.
- Issues must include: problem/objective, expected outcome, acceptance criteria.
- Large work is decomposed with sub-issues and `blocked by` / `blocking` dependencies.
- Templates required: at minimum bug, task, and epic forms. `blank_issues_enabled: false` in config.yml.
- For detailed lifecycle execution, invoke `github-ticket-lifecycle-orchestrator` skill.

## Review and merge gates

- Required reviewers/approvals satisfied before merge.
- Required status checks green on the latest commit.
- All review conversations resolved.
- Rulesets/branch protection requirements satisfied.
- Merge method follows repo policy.
- For detailed review/merge administration, invoke `github-review-merge-admin` skill.

## Actions security baseline

- `GITHUB_TOKEN`: default to read permissions; elevate per-job only when required.
- Third-party actions: pin to full commit SHA where policy requires.
- Prefer OIDC over long-lived static cloud credentials.
- CODEOWNERS coverage for `.github/workflows/`.
- No auto-remediation that broadens permissions.
- For detailed Actions hardening, invoke `github-actions-security-hardening` skill.

## Release and incident flow

- Changelog/release notes prepared before tagging.
- Release evidence (tests/checks/artifacts) linked to release item.
- Rollback path and owner documented.
- Incident items include severity, impact, owner, and containment plan.
- Hotfix branch/PR linked to incident issue with validation evidence.
- Follow-up prevention tickets created before incident closure.
- For detailed release/incident procedures, invoke `github-release-incident-flow` skill.

## Project linkage

- Project items have status, priority, iteration, and owner fields populated.
- Issue ↔ branch and issue ↔ PR linkage maintained in the Development panel.
- Built-in workflows: auto-add, status sync, auto-archive configured where available.
- For detailed Agile linkage setup, invoke `github-projects-agile-linkage` skill.

## Capability-first routing

- Before recommending rulesets, merge queue, or plan-sensitive features, run `github-capability-resolver` to verify availability by plan/visibility/owner type.
- Route all GitHub workflow governance requests through `github-ops-tree-router` to the correct specialist skill.
- Use `github-ops-excellence` as the policy catalog overlay for calibrating strictness.
- For ruleset design/migration, invoke `github-ruleset-architecture` skill.
