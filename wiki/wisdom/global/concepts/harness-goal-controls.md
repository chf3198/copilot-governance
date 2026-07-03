---
title: "Harness Goal Controls (G1..G9 enforcement and evidence map)"
type: concept
created: 2026-05-08
status: active
---
# Harness Goal Controls

Aggregated map of enforcement primitives + evidence signals per goal G1..G9. Primary deliverable of #1105 D-003 cross-team consensus.

## Summary

Each of the nine harness goals has at least one enforcement primitive (lint rule / hook / CI gate / runtime contract) that prevents violation at write or merge time, AND at least one evidence signal (log path / metric / report file / CI artifact) that proves compliance after the fact. This page is the canonical aggregated view; the `wiki/concepts/harness-goals.md` page documents the priority order.

## G1 Governance

| Layer | Primitive / Signal | File:line |
| --- | --- | --- |
| Enforcement | label-lint Rules 1-9 + E2/E3/E5 (Epic-aware) | `.github/workflows/label-lint.yml` |
| Enforcement | baton-gates (handoff artifacts required) | `.github/workflows/baton-gates.yml` |
| Enforcement | evidence-completeness (60s pre-PR handoff timing) | `.github/workflows/evidence-completeness.yml` |
| Enforcement | governance-audit composite check | `scripts/global/governance-audit.js` |
| Enforcement | epic-close-readiness gate | `.github/workflows/epic-close-readiness.yml` |
| Evidence | issue comment trail (HANDOFF/CLOSEOUT artifacts) | `gh issue view N --json comments` |
| Evidence | governance-audit JSON | `/tmp/governance-audit.json` |
| Evidence | label-lint check status per issue | GitHub Actions runs |

## G2 Quality

| Layer | Primitive / Signal | File:line |
| --- | --- | --- |
| Enforcement | lint-readability 420-score gate | `scripts/global/lint-readability-core.js` |
| Enforcement | 100-line per-file ceiling | `scripts/lint.js` |
| Enforcement | pr-title-required CI gate | `.github/workflows/branch-name.yml` |
| Enforcement | quality-required gate (cost-quality parity) | `.github/workflows/compliance-report.yml` |
| Enforcement | danger-required + dependency-review-required | `.github/workflows/danger.yml`, `dependency-review.yml` |
| Evidence | Playwright test reports | `tests/`, CI artifacts |
| Evidence | quality-parity report | `research/stage-4-cost-report-2026-05-06.json` |
| Evidence | wiki eval-harness report | `logs/wiki-eval-report.json` (when emitted) |

## G3 Zero Cost

| Layer | Primitive / Signal | File:line |
| --- | --- | --- |
| Enforcement | cache-hit-gate (blocks routing on cold cache) | `scripts/global/cache-hit-gate.js` |
| Enforcement | hamr-provider-wrapper enforces sticky-route + cacheHeaders | `scripts/global/hamr-provider-wrapper.js` |
| Enforcement | cascade-dispatch (Free → Fleet → Haiku → Premium) | `scripts/global/cascade-dispatch.js` |
| Enforcement | sticky-route per tier | `scripts/global/sticky-route.js` |
| Evidence | cache-stats.jsonl emit-site | `~/.megingjord/cache-stats.jsonl` |
| Evidence | HAMR `/quota.hit_rate_7d` | `https://hamr.chf3198.workers.dev/quota` |
| Evidence | cost-baseline + cost-report deltas | `research/stage-*-cost-report-*.json` |

## G4 Privacy

| Layer | Primitive / Signal | File:line |
| --- | --- | --- |
| Enforcement | detect-secrets CI gate | `.github/workflows/detect-secrets.yml` |
| Enforcement | `.secrets.baseline` + audit decisions | `.secrets.baseline` |
| Enforcement | pre-commit hook (optional) | `hooks/scripts/detect-secrets-precommit.sh` |
| Enforcement | dependency-review (license/CVE) | `.github/workflows/dependency-review.yml` |
| Evidence | detect-secrets workflow run history | GitHub Actions runs |
| Evidence | `.secrets.baseline` file as audit ledger | repo file |

## G5 Portability

| Layer | Primitive / Signal | File:line |
| --- | --- | --- |
| Enforcement | fleet-config + devices.example.json (no-user-coupling) | `scripts/global/fleet-config.js`, `inventory/devices.example.json` |
| Enforcement | `MEGINGJORD_HAMR_DISABLED=1` air-gapped opt-out | documented in `instructions/hamr-routing.instructions.md` |
| Evidence | fleet-portable-config skill walkthrough | `skills/fleet-portable-config/` |
| Evidence | devices.example.json sanity (works without devices.json) | `inventory/devices.example.json` |

## G6 Resilience

| Layer | Primitive / Signal | File:line |
| --- | --- | --- |
| Enforcement | header-spillover across providers | `scripts/global/header-spillover.js` |
| Enforcement | sticky-route TTL fallback | `scripts/global/sticky-route.js` |
| Enforcement | broker quarantine (dirty-checkout) | `scripts/global/broker.js` |
| Evidence | graceful-degrade test suite | `tests/fleet-graceful-degrade.spec.js` |
| Evidence | header-spillover decision logs | runtime stderr; `tests/header-spillover.spec.js` |

## G7 Throughput

| Layer | Primitive / Signal | File:line |
| --- | --- | --- |
| Enforcement | anthropic-batch-router (50% discount, time-elastic) | `scripts/global/anthropic-batch-router.js` |
| Enforcement | batch-validator + batch-route policy | `scripts/global/batch-route.js`, `batch-validator.js` |
| Enforcement | latency-based-routing TTL stats | `scripts/global/cascade-policy-overrides.js` |
| Evidence | batch-route receipts (`msgbatch_*` IDs) | Anthropic Batch API responses |
| Evidence | sticky-route warm-cache TTL output | runtime metrics |

## G8 Observability

| Layer | Primitive / Signal | File:line |
| --- | --- | --- |
| Enforcement | governance-audit.js daily run + JSON output | `scripts/global/governance-audit.js` |
| Enforcement | cost-report.js + cost-telemetry.js | `scripts/global/cost-report.js`, `cost-telemetry.js` |
| Enforcement | wiki/log.md append-only audit ledger | `wiki/log.md` |
| Evidence | `/tmp/governance-audit.json` | local artifact |
| Evidence | dashboard cost panels | `dashboard/js/cost-report.js` |
| Evidence | HAMR `/quota` endpoint | `https://hamr.chf3198.workers.dev/quota` |

## G9 Interoperability

| Layer | Primitive / Signal | File:line |
| --- | --- | --- |
| Enforcement | broker cross-team coordination | `scripts/global/broker.js` |
| Enforcement | token-provider-adapters (multi-provider table) | `scripts/global/token-provider-adapters.js` |
| Enforcement | hamr-sync-verify (runtime parity) | `scripts/global/hamr-sync-verify.js` |
| Evidence | broker SQLite lease registry | `~/.megingjord/broker.db` |
| Evidence | end-to-end provider adapter tests | `tests/hamr-team-integration.spec.js` |
| Evidence | cross-runtime parity (CC/CP/CX deployed assets sync) | `npm run sync:codex`, `sync:claude` |

## G10 Maintainability

| Layer | Primitive / Signal | File:line |
| --- | --- | --- |
| Enforcement | lint: ≤100 lines per file | `npm run lint` |
| Enforcement | cyclomatic complexity checks (≤10 per fn) | `lint-configs/` |
| Enforcement | no dead code at merge | Danger `Dangerfile.js` |
| Evidence | G10 in priority sentence across always-loaded surfaces | #1966 (this ticket) |
| Evidence | Consultant rubric G10 box | `instructions/role-consultant-critique.instructions.md` |

## OWASP Agentic Top 10 Risk Coverage

Source: OWASP Top 10 for Agentic Applications (December 2025). Full mapping in `instructions/owasp-agentic-mapping.instructions.md`.

| # | Risk | Mapped Goals | Coverage | Notes |
|---|---|---|---|---|
| OA1 | Goal Hijacking | G1 G2 | Advisory | Ticket-first + operator-identity gates; no blocking test fixture yet |
| OA2 | Tool Misuse | G1 G4 | Enforced | `pretool_guard.py` permissions allowlist; blast-radius declarations pending |
| OA3 | Identity Abuse | G1 G4 | Enforced | `team-model-signing`; signer-alias-canonical gate |
| OA4 | Memory Poisoning | G2 G4 | Partial | `memory-watchdog`; schema validation on auto-writes gap |
| OA5 | Cascading Failures | G6 | Partial | Header-spillover + sticky-route TTL; circuit-breaker gap |
| OA6 | Rogue Agents | G1 G9 | Enforced | Broker quarantine + single-thread baton; inter-agent tamper-evidence pending |
| OA7 | Supply Chain | G4 | Enforced | Dependency-review + secret-scanning + cosign attestation |
| OA8 | Insecure Communications | G4 | Partial | DPoP for HAMR; cross-runtime zero-trust mesh gap |
| OA9 | Human-Agent Trust Exploitation | G1 G8 | Advisory | Closeout evidence required; append-only wiki/log.md |
| OA10 | Code Execution | G4 | Enforced | No LLM eval; no shell-from-prompt; sandbox boundaries auditable |

## How to use this page

- **Authoring a new control**: pick the goal it primarily serves; add a row under the right Layer (Enforcement vs Evidence). If a control serves multiple goals, list it under each.
- **Auditing coverage**: every goal must have ≥1 Enforcement row AND ≥1 Evidence row. Empty cells are governance gaps.
- **Future automation** (#1113 actuator wiring): `scripts/global/governance-audit.js` will eventually parse this page (or a JSON sibling) to compute Goal Health Score per `#1114` design.

## Sources

- Cross-team R&D synthesis #1105 D-003 (3-team consensus)
- CC-RD §4-§5 `research/epic-1105-claude-code-team-rd-2026-05-07.md`
- CP-RD seedmap `research/epic-1105-copilot-planning-package-2026-05-07.md`
- CX-RD enforcement inventory `research/epic-1105-codex-team-rd-2026-05-07.md`

## Related

- `wiki/concepts/harness-goals.md` — priority order + canonical definitions
- `instructions/harness-goals.instructions.md` — canonical instruction file
- `instructions/global-standards.instructions.md` — priority sentence (always-loaded)
- `instructions/owasp-agentic-mapping.instructions.md` — OWASP Agentic Top 10 risk-to-goal mapping
- Epic #1113 — multi-layer self-annealing goal-governance (consumes this map as sensor input)
