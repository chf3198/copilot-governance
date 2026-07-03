---
title: Readability & Commenting Toolchain Research (2026-04-29)
type: source
created: 2026-04-29
updated: 2026-04-30
tags: [readability, jsdoc, linting, formatting, governance]
status: active
---
# Readability & Commenting Toolchain Research (2026-04-29)

## Sources Reviewed

- Prettier docs: https://prettier.io/docs/
- ESLint flat config docs: https://eslint.org/docs/latest/use/configure/configuration-files
- eslint-plugin-jsdoc: https://github.com/gajus/eslint-plugin-jsdoc
- Biome docs: https://biomejs.dev/
- Google JS Style Guide: https://google.github.io/styleguide/jsguide.html

## Key Findings

1. Prettier remains the safest default formatter for broad ecosystem compatibility.
2. ESLint flat config is current standard and supports strict linter options for unused inline disables.
3. eslint-plugin-jsdoc has mature flat configs and granular rule packs suited for staged rollout.
4. Biome is materially faster and combines format+lint, but migration cost/rule parity risk is non-trivial.
5. Modern governance should separate concerns:
   - Formatter for deterministic layout.
   - Linter for semantics/readability rules.
   - JSDoc plugin for comment contract quality.

## Recommended Default Profile (Harness-wide)

- Formatter: Prettier (authoritative formatting output).
- Lint core: ESLint flat config.
- Comment quality: eslint-plugin-jsdoc recommended-error plus targeted relaxations.
- Readability checks: existing custom readability lint retained and made blocking in phases.
- Shell readability: shellcheck + explicit comments for non-obvious control/error flow.

## Rollout Strategy

1. Autofix-first wave (`format --write`, ESLint `--fix`) to minimize manual churn.
2. Baseline snapshot and ratchet (warning count must trend downward).
3. Block regressions only after baseline stabilization.
4. Keep suppression scope narrow and auditable.

## Risk Notes

- Enabling strict JSDoc globally too early can create high friction.
- Large single-shot formatting PRs reduce review quality.
- Biome switch without parity validation may break existing CI expectations.

## Actionable Next Steps

- Publish harness-level readability/commenting profile docs.
- Package shared lint+format scripts for install into downstream repos.
- Add CI check names that align with branch protection policy.

_Last updated: 2026-04-29_
