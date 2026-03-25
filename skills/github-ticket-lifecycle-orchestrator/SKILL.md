---
name: github-ticket-lifecycle-orchestrator
description: Orchestrate end-to-end ticket lifecycle across manager, collaborator, reviewer, and admin roles in GitHub: create/refine, assign, branch, develop, PR, review, merge, and closeout with evidence.
argument-hint: [phase: intake|planning|assignment|execution|pre-pr|review|pre-merge|closeout] [scope: repo|org] [policy-profile: strict|standard|light]
user-invocable: true
disable-model-invocation: false
---

# GitHub Ticket Lifecycle Orchestrator

## Purpose

Provide one bounded operating flow that connects issue management, branching, development execution, review, and merge administration.

## Hard constraints

1. No unbounded loops.
2. Max one lifecycle pass per invocation.
3. If required evidence is missing, return `NO_CHANGE` with missing artifacts.
4. Do not claim merge/closeout success without verification evidence.

## Issue ID and title standard (universal — all repos)

This standard applies to every repository managed under this skill set. Agents
must apply it at intake for every new issue and enforce it during triage audits.

### Canonical ticket identifier

- The GitHub issue number (`#N`) is the **sole canonical ticket identifier**.
- Do **not** create or maintain parallel local ID schemes (`TICKET-NNN`, `JIRA-123`,
  audit-doc sequential IDs, etc.). These diverge from `#N` and break closing keywords,
  branch linkage, and cross-repo references.
- When migrating tickets from external sources (audit docs, Notion, spreadsheets),
  use the assigned `#N` immediately after creation; discard the source ID or note
  it as an alias only.

### Issue title format — plain imperative (human-scannable)

Issue titles must be readable in a project board, search result, or notification
without any parsing. **Do not apply Conventional Commits prefixes to issue titles.**
Type and scope are expressed via labels, not the title.

```
<Imperative verb phrase describing the desired outcome>  [≤ 72 chars]
```

| Rule                           | Detail                                                            |
| ------------------------------ | ----------------------------------------------------------------- |
| Start with an imperative verb  | "Fix", "Add", "Normalize", "Redesign", "Audit", "Stabilize"       |
| Plain English, human-scannable | Must make sense standalone in a board or search result            |
| No `type(scope):` prefix       | Type is a label (`type: bug-fix`); scope is a label (`area: seo`) |
| ≤ 72 chars                     | Fits project board columns and notification subjects              |

**Correct examples:**

- `Fix header nav contrast on dark hero backgrounds`
- `Normalize /services-store title and meta description for Austin SEO`
- `Redesign footer layout, hierarchy, and mobile composition`
- `Audit interactive states and produce sitewide affordance spec`
- `Stabilize Playwright QA runtime for repeatable pre-publish checks`

**Incorrect — do not use:**

- ~~`fix(nav-contrast): fix header nav contrast`~~ — Conventional Commits belongs on commits/PRs, not issues; also redundant
- ~~`TICKET-008: Fix header nav contrast`~~ — parallel ID scheme
- ~~`[BUG] header nav contrast issue`~~ — bracket tags are label substitutes

### Commit and PR title format — Conventional Commits

The `type(scope): description` format (Conventional Commits) belongs on **commit
messages and PR titles** — not issue titles.

```
<type>(<scope>): <imperative description>  [≤ 72 chars]
```

Allowed types: `feat` `fix` `chore` `content` `perf` `refactor` `docs` `style` `test`

Examples:

- `fix(nav-contrast): apply WCAG AA contrast to header nav links`
- `feat(footer): redesign footer layout and mobile composition`
- `chore(qa-runtime): document mem-watchdog pause sequence in uat-guide`

### Branch naming

```
<type>/<issue-number>-<short-slug>
```

Examples: `fix/5-nav-contrast`, `feat/11-footer-redesign`, `chore/13-qa-runtime`

The `<issue-number>` segment creates an unambiguous link to the GitHub issue
without relying on closing keywords alone.

### Template requirements

Every repository must have:

- `.github/ISSUE_TEMPLATE/` containing **at minimum** one bug form, one task form, and one epic form (filenames may vary, e.g. `bug-report.yml`, `task-request.yml`)
- `blank_issues_enabled: false` in `.github/ISSUE_TEMPLATE/config.yml`
- A `PULL_REQUEST_TEMPLATE.md` with linked issue, validation evidence, and risk fields

Recommended: include a research/audit issue form when `type: research` is used in the repository workflow.

The triage phase must verify template adherence before any issue enters planning.

---

## Phase protocol

### `intake`

- Validate issue statement, acceptance criteria, and business impact.
- Apply labels, type, priority, and milestone/iteration.

### `planning`

- Split large work into sub-issues.
- Add dependencies (`blocked by` / `blocking`).
- Ensure project item fields are set (status, priority, iteration, owner).

### `assignment`

- Confirm single responsible owner.
- Confirm due window/iteration and unblocker owner for blockers.

### `execution`

- One branch per ticket concern.
- Link branch in issue Development panel.
- Keep commits atomic and scoped.

### `pre-pr`

- PR links issue(s) with closing keywords where appropriate.
- Test/validation evidence attached.
- Reviewer(s) and CODEOWNERS requested.

### `review`

- Resolve feedback; keep conversation state clean.
- Re-run required checks after substantive changes.

### `pre-merge`

- Required reviews/checks/rulesets all satisfied.
- Merge method follows repo policy.

### `closeout`

- Confirm issue state transition and project status updates.
- Confirm branch deletion and post-merge cleanup.

## Output format (required)

```text
TICKET_LIFECYCLE_REPORT
phase: <intake|planning|assignment|execution|pre-pr|review|pre-merge|closeout>
scope: <repo|org>
policy_profile: <strict|standard|light>

checks:
- id: C1
  result: <pass|fail|partial>
  observation: <what was found>
  expected: <required state>

actions:
1) priority: <P1|P2|P3>
   owner: <role/person>
   change: <specific action>
   verification: <objective pass condition>

decision:
- <apply|defer|NO_CHANGE>

missing_evidence:
- <none or required artifacts>
```
