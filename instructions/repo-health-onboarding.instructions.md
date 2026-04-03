---
name: Repo Health and Onboarding
description: Always-on rules for repository profile governance, community health, contribution surfaces, and standards routing. Distilled from repo-profile-governance, repo-onboarding-standards, and repo-standards-router skills.
applyTo: "**"
---
# Repo Health and Onboarding

## Community health baseline (every repo)

Every repository must have:
- `README.md` with clear purpose, quick-start, and usage context.
- `LICENSE` when distribution requires it.
- `CONTRIBUTING.md` — contributor workflow and expectations.
- `CODE_OF_CONDUCT.md` — community standards.
- `SECURITY.md` — vulnerability reporting process.
- `SUPPORT.md` — where to get help.

Files live in repo root or `.github/`. Missing items are prioritized:
- **P1**: security/reporting or contributor-blocking gaps.
- **P2**: discoverability/collaboration quality gaps.
- **P3**: polish/consistency gaps.

## Repository metadata quality

- `description` is concise and accurate.
- `homepage` is set when applicable.
- Topics are present, normalized, and relevant.
- Social preview image exists and is intentional (not fallback-only).

## Contribution surfaces

- Issue templates exist covering at minimum: bug, task, and epic forms.
- `blank_issues_enabled: false` in `.github/ISSUE_TEMPLATE/config.yml`.
- PR template exists enforcing linked issue, evidence/checklist, and risk fields.
- `.github/CODEOWNERS` exists for critical paths.

## Standards routing (new repos or first sessions)

- Classify repository by primary app type (`website-static`, `web-app`, `library-sdk`, `infra-automation`) before applying standards.
- Apply core-baseline controls, then primary-type controls, then relevant overlays (`security`, `collaboration`, `release`, `observability`).
- Prefer the smallest correct standards stack over over-engineered policy.
- For detailed routing, if available, invoke `repo-standards-router` skill.
- For new/uninitialized repos, invoke `repo-onboarding-standards` skill.

## Governance audit triggers

Run `repo-profile-governance` skill when:
- Starting a new session in any repository (quick health check).
- Before any public release.
- When community health gaps are suspected.

## Repository structure conventions

- On new repos or restructuring, if available, invoke `repo-structure-conventions` skill.
- Every repo follows a universal root layout: README, LICENSE, CHANGELOG, .gitignore, .github/, docs/, scripts/, test/.
- CHANGELOG.md follows [Keep a Changelog](https://keepachangelog.com/) format: Added, Changed, Deprecated, Removed, Fixed, Security.
- Build artifacts are isolated via .gitignore (and .vscodeignore / .npmignore where applicable).
- No build outputs (dist/, node_modules/, resources/, *.vsix, __pycache__/) in git history.



## Consistency across repos

- Critical standards are consistent across all managed repositories.
- Deviations are documented and intentional, not accidental drift.
- Weekly `profile-weekly-check` mode available for recurring hygiene regression detection.
