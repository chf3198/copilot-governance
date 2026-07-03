---
title: HAMR Doctor
type: concept
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, operator-ux, capability-probe, tier-detection, remediation, doctor]
related: ["[[hamr-v3-2-2026-05-04]]", "[[capability-detection]]", "[[baton-signing]]", "[[judge-quorum]]"]
status: draft
---

# HAMR Doctor

## Purpose

Operator-facing CLI that reports the harness's HAMR readiness and
emits per-capability remediation plans without deploying any paid
resource. Implements remediation R7 from HAMR v3.2 (#890) — the
capability-gated 3-tier deployment model — and is the entry point
that Wave 5 child 8 (`hamr:status`) extends with persistent
operator UX.

## Module API

`scripts/global/hamr-doctor.js` (CommonJS):

| Function | Purpose |
|---|---|
| `runDoctor(opts)` | Read `.dashboard/capabilities.json` (S2 #877 schema_v2), probe baton-signing key tier (#894), enumerate judge-quorum families (#895), build the report. |
| `buildReport(caps, keyTier)` | Pure function over a capabilities object — returns the structured report. Used in tests with fixture data. |
| `tierFor(caps)` | Tier classification only (tier1-full / tier2-degraded / tier3-offline). |
| `buildRemediations(caps)` | List of `{capability, advice}` for missing capabilities. |

CLI: `npm run hamr:doctor` (human-readable) or `node scripts/global/hamr-doctor.js --json` (machine-readable).

## 3-tier deployment model

| Tier | Condition | Behaviour |
|---|---|---|
| **tier1-full** | All 6 HAMR capabilities present + judge quorum reachable | Full feature set: bundle publish, mailbox writes, MCP connect, OIDC release. |
| **tier2-degraded** | CF reachable but ≥1 capability missing | Read-only HAMR: fetch-only bundles from CDN/npm fallback; no mailbox writes; deterministic governance gates only. |
| **tier3-offline** | CF unreachable OR capability snapshot absent | Pre-HAMR mode: harness operates exactly as today (cascade-dispatch + free-router + capability-probe + wiki). HAMR features quietly disabled. |

**Critical guarantee from v3.2:** Tier 3 ≡ today's harness. HAMR
never makes the harness worse — it's a strict superset.

## Remediation messages

Per-capability hints (no automated install — operator authority
required for any state change):

| Capability | Remediation |
|---|---|
| `wrangler` | `npm i -g wrangler@4 && wrangler login` |
| `r2` | Enable R2 in CF dashboard (≈$5/mo) → `wrangler r2 bucket list` |
| `mcp_client` | `npm i -g @modelcontextprotocol/sdk` |
| `github_oidc` | Configure repo OIDC trust in GitHub settings → Actions → Workflow permissions |
| `npm_trusted_publishing` | `npm whoami` then add `publishConfig.provenance` to `package.json` |

## Read-only invariant

`hamr:doctor` MUST NOT:

- Create or modify R2 buckets.
- Deploy or modify Workers.
- Call any paid LLM API.
- Run `npm install` (only the user does that, after seeing the
  remediation message).
- Mutate any operator credential or keyring entry.

This is enforced by review and by the test that supplies fixture
capability data without a real probe.

## Wave-1 vs MVP-execution scope

| Capability | Wave 1 (this module) | MVP execution (HAMR child 8) |
|---|---|---|
| Tier classification | ✓ | ✓ |
| Per-capability remediation | ✓ | ✓ |
| Key-store tier reporting (T1–T4) | ✓ | ✓ + durable binding flow |
| Judge-family enumeration | registry only | + runtime reachability + provenance verification |
| `--json` output | ✓ | ✓ |
| `--accept-paid-resources` flag | — | ✓ (Wave 5) |
| OAuth magic-link onboarding | — | ✓ (Wave 5) |
| Persistent operator-keyring rotation | — | ✓ (Wave 5) |

## References

- HAMR v3.2 §3.R7: `research/hamr-v3-2-2026-05-04.md` (#890).
- Capability schema: `wiki/concepts/capability-detection.md` (S2 #877).
- Implementation: `scripts/global/hamr-doctor.js` (#896).
- Tests: `tests/hamr-doctor.spec.js` + `tests/fixtures/capabilities-tier{1,2,3}.json` (#896).
