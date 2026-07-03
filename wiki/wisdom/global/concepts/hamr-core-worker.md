---
title: HAMR Core CF Worker
type: concept
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, wave2, cloudflare, worker, kv, r2, mcp, dpop]
related: ["[[hamr-v3-2-2026-05-04]]", "[[hamr-v3-2-1-2026-05-05]]", "[[baton-signing]]", "[[hamr-doctor]]"]
status: draft
---

# HAMR Core CF Worker

## Purpose

Centralised CF Worker that exposes HAMR substrate primitives. Per
HAMR v3.2 §5 child 1 + v3.2.1 §R9. **Coexists with the existing
`cloudflare/worker.ts` (megingjord-coord)**, which stays in service
until Wave 3 child 5 (mailbox) supersedes it. HAMR's strict-superset
guarantee is preserved.

Production URL: `https://hamr.chf3198.workers.dev`.

## Routes

| Route | Method | Status (Wave 2) | Purpose |
|---|---|---|---|
| `/healthz` | GET | 200 with tier classification | Tier-aware health: probes KV + R2 bindings, returns tier1-full / tier2-degraded / tier3-offline (R9.3-bounded ≤5 s) |
| `/bundle/<profile>/<sha>` | GET | 200 (object) / 404 / 400 | Content-addressed bundle fetch from R2; KV edge-cache headers per v3.2 §R4 |
| `/mcp` | POST | 401 / 503 / future 200 | DPoP gateway: verifies Ed25519 over canonical body via `PUBLISHER_KEYRING`. SLSA gate placeholder (Wave 2 child 6 wires real verifier). |
| `/mailbox/read` | GET | 501 placeholder | Wave 3 child 5 (R2 JSONL + Google A2A) |
| `/mailbox/write` | POST | 501 placeholder | Wave 3 child 5 |
| `/quota` | GET | 200 placeholder | Wave 4 child 9 token-quota report |
| `*` | * | 404 JSON | Unknown route |

## Bindings

| Binding | Type | Purpose |
|---|---|---|
| `HAMR_KV` (id `a01abe088f454a59973e72736978b5e5`) | KV namespace | OAuth state + cache-hit-rate counters + rate-limit-spillover headers |
| `HAMR_BUNDLES` (`hamr-bundles`) | R2 bucket | Bundle storage at `bundles/<profile>/<sha>.tar.zst` per v3.2 §R3 |
| `PUBLISHER_KEYRING` | Wrangler secret | JSON `{key_id: base64-spki}` for Ed25519 verify (set via `wrangler secret put`) |

## Security headers

Every response carries: `strict-transport-security`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`. Plus `x-hamr-elapsed-ms` for ops visibility.

## v3.2.1 R9 patterns applied

- **R9.1 Worktree-isolation**: `hamr-deploy.sh` reads cwd via `BASH_SOURCE` resolution and tolerates running from a worktree.
- **R9.2 Cwd-vs-branch pre-flight**: `hamr-deploy.sh` refuses detached HEAD; logs `branch=<name>` before deploying.
- **R9.3 Sequential dispatch with backoff**: `/healthz` races each binding probe against a 1 s timeout per probe and never blocks total response beyond ~3 s.
- **R9.4 Idempotent tear-down**: `hamr-deploy.sh` post-condition is HTTP 200 on `/healthz`; paired `hamr-teardown.sh` post-condition is HTTP 404.

## Files

- `cloudflare/hamr/worker.ts` — top-level router (≤100 lines).
- `cloudflare/hamr/routes/{healthz,bundle,mcp,mailbox,quota}.ts` — per-route handlers (≤100 lines each).
- `cloudflare/hamr/wrangler.toml` — production config; bindings live here. Secrets NOT committed.
- `scripts/global/hamr-deploy.sh` — deploy with R9.2 + R9.4 pre-flight/post-condition.
- `scripts/global/hamr-teardown.sh` — tear-down with HTTP-404 verification.
- `tests/hamr-worker.spec.js` — 10 live-route Playwright tests.

## Wave 2 → Wave 3/4 evolution

- Wave 2 child 6 (#912) adds SLSA-L3 + cosign attestation; `/mcp` will check `slsa-verify.js` before serving.
- Wave 3 child 5 (#871-equivalent) wires `/mailbox/{read,write}` against R2 JSONL + Google A2A envelopes with R2 signed-envelope verification.
- Wave 4 child 9 fills `/quota` with header-driven spillover state.

## Observability (C8 #998)

Workers Observability v2 enabled via `[observability] enabled = true` + `head_sampling_rate = 1.0` in `cloudflare/hamr/wrangler.toml`. Cloudflare auto-instruments fetch calls, KV/R2 binding ops, and handler invocations — no code changes required. Backward compat: `x-hamr-elapsed-ms` response header retained as a lightweight client-side timing signal alongside the trace pipeline.

## References

- HAMR v3.2 §5 child 1: `research/hamr-v3-2-2026-05-04.md` (#890).
- v3.2.1 §R9 patterns: `research/hamr-v3-2-1-2026-05-05.md` (#907).
- DPoP verifier (#894): `scripts/global/baton-signing.js`.
- Implementation: this PR (#910).
- Observability v2 adoption: tooling C8 (#998).
