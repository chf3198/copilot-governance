---
title: Linting Governance
type: concept
created: 2026-04-14
updated: 2026-04-30
tags: [linting, governance, code-quality]
status: active
---
# Linting Governance

Global enforcement of code quality, documentation, and style
standards across all DevEnv Ops-managed repositories.

## Core Principle

Every fleet repository uses the same lint rules, authored in
devenv-ops and distributed via shared configs. Lint configs are
the "source of truth" — repos copy them, never override.

## Governance Tiers

| Tier | Scope | Priority |
|------|-------|----------|
| T1 — Documentation | JSDoc, docstrings, file headers | P0 |
| T2 — Code Quality | eslint:recommended, Ruff F+E, shellcheck | P1 |
| T3 — Style | Formatting, import ordering | P2 |

## Toolchain

- **JS/TS**: ESLint v9 flat config + eslint-plugin-jsdoc
- **Python**: Ruff (pydocstyle D rules, Google convention)
- **Bash**: shellcheck
- **CSS**: stylelint
- **Markdown**: markdownlint

## Architecture

```
devenv-ops/lint-configs/     → Each repo's lint-configs/
  eslint.config.devenv.js       (copied, hash-verified)
  ruff.devenv.toml
  .shellcheckrc
```

## Integration Points

- [[governance-enforcement]] — 5th surface: inline code docs
- [[governance-enforcement]] — CI gates block on lint failure
- [[governance-enforcement]] — new repos get configs

## Implementation Status

✅ **Implemented** — `lint-configs/` created in devenv-ops (epic #101).

| File | Purpose |
|------|---------|
| `lint-configs/eslint.config.devenv.js` | ESLint v9 flat config, JSDoc T1 |
| `lint-configs/ruff.devenv.toml` | Ruff standalone config, Google conv. |
| `lint-configs/ci-lint.yml` | GHA workflow template |
| `lint-configs/lint-baseline.md` | Baseline waiver register |

**devenv-ops dogfood**: `npm run lint:all` passes (exit 0).
- ESLint: 0 errors (208 baseline warnings — waived, tracked in #111)
- Ruff: 0 errors
- shellcheck: 0 issues

## Per-Repo Wiring

```bash
cp devenv-ops/lint-configs/eslint.config.devenv.js lint-configs/
cp devenv-ops/lint-configs/ruff.devenv.toml lint-configs/
# Add to package.json scripts:
# "lint:js": "eslint -c lint-configs/eslint.config.devenv.js src/"
# "lint:py": "ruff check --config lint-configs/ruff.devenv.toml ."
# "lint:sh": "find scripts -name '*.sh' -exec shellcheck {} +"
```

## Baseline Waivers

Pre-existing violations are documented in `lint-configs/lint-baseline.md`
and waived for incremental adoption. Forward-fix in #111.

## Related

- Epic #101: Global linting governance (closed)
- Forward-fix: #111 — ESLint baseline remediation
- `lint-configs/lint-baseline.md` — waiver register

See also: [[js-code-quality-practices]], [[nodejs-install-patterns]], [[nodejs-project-organization]]

See also: [[global-readability-governance-harness]]
