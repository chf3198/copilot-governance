---
title: "Cost→Quality Self-Anneal (2026)"
type: source
created: 2026-04-23
updated: 2026-04-23
tags: [cost, quality, anneal, ci, routing]
sources:
  - research/cost-efficiency-self-anneal-2026-04-23.md
  - https://docs.github.com/en/billing/concepts/product-billing/github-actions
  - https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
  - https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
  - https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching
  - https://playwright.dev/docs/test-cli
  - https://eslint.org/docs/latest/use/command-line-interface
related: ["[[self-annealing]]", "[[linting-governance]]", "[[model-routing]]"]
status: draft
---

# Cost→Quality Self-Anneal (2026)

## Summary

- Highest-confidence savings come from model routing discipline plus CI run suppression.
- Quality protection requires two-lane validation: fast PR lane and full merge/nightly lane.
- Weekly scorecard is required to avoid over-optimization and quality drift.

## Key Decisions

1. Keep strict escalation criteria for premium models.
2. Add path filters + concurrency + dependency caches with required-check guardrails.
3. Institutionalize weekly anneal review with explicit rollback conditions.

## Next Steps

1. Implement routing and telemetry controls (#144).
2. Implement CI selective-execution controls (#145).
3. Implement weekly scorecard automation (#146).

Last updated: 2026-04-23
