---
title: HAMR Release Pipeline
type: concept
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, wave2, slsa, cosign, sigstore, oidc, release, ci]
related: ["[[hamr-v3-2-2026-05-04]]", "[[hamr-v3-2-1-2026-05-05]]", "[[hamr-core-worker]]", "[[baton-signing]]"]
status: draft
---

# HAMR Release Pipeline

## Purpose

Production release pipeline that signs every HAMR bundle with
SLSA-L3 attestation + Cosign Bundle 1.0 + OIDC publishing. Per
HAMR v3.2 §5 child 6 (ADOPT-only) + v3.2 §R3 (bundle integrity);
v3.2.1 §R9.4 (idempotent tear-down).

Workflow: `.github/workflows/release.yml`. Triggers on `git tag
v*` push or `workflow_dispatch`.

## Adopted libraries

Per S6 #881 build-vs-adopt; pinned to specific commit SHAs per
.github security baseline:

| Library | Purpose | Pin |
|---|---|---|
| `slsa-framework/slsa-github-generator` | SLSA-L3 attestation | reusable workflow `generic_generator/generic_slsa3.yml@v2.0.0` |
| `sigstore/cosign-installer` | Keyless Fulcio signing | SHA `d7d6e113…` (v3.7.0) |
| `cloudflare/wrangler-action` | OIDC Worker deploy | SHA `392082e8…` (v3.14.1) |
| `actions/checkout` | Source checkout | SHA `11bd7190…` (v4.2.2) |
| `actions/setup-node` | Node 22 | SHA `1d0ff469…` (v4.2.0) |
| `actions/upload-artifact` | Artifact handoff | SHA `65c4c4a1…` (v4.6.0) |
| `actions/download-artifact` | Artifact handoff | SHA `fa0a91b8…` (v4.1.8) |

## Pipeline DAG

`tag-push v*` → `build` (hamr-bundle-build.js produces
`dist/bundles/<tier>-<sha-prefix>.tar.zst`) → `slsa-attest` (reusable
SLSA-L3 workflow) + `cosign-sign` (keyless Fulcio sign-blob) →
`publish-r2-deploy-worker` (R2 upload + wrangler-action OIDC deploy +
slsa-verifier post-check).

## Modules

- **`scripts/global/hamr-bundle-build.js`** — content-addressed bundle
  generator. Wave 2 ships `governance-30kb` (instructions + 4 wiki
  concept pages); Wave 4 child 7 ships full tier set (`fim-5kb`,
  `routing-12kb`, `architect-90kb`). Canonical concat: NUL-separated
  `<rel>\0<content>` pairs sorted by path → SHA-256 → first 16 hex
  chars in filename.
- **`scripts/global/slsa-verify.js`** — wraps `slsa-verifier
  verify-artifact` + `cosign verify-blob`. Used by `hamr:doctor`
  (#896) tier-classification + Worker `/mcp` (#910) bundle-serve
  gate. Both verifiers fail closed if CLI binary missing.

## v3.2.1 R9.4 idempotent tear-down

The release pipeline produces a paired rollback artifact via
`wrangler-action` deploy versioning: every deploy increments
the Worker version on Cloudflare; rollback is `wrangler
rollback --version-id <prev>`. Cosign signatures are revocable
via the sigstore Fulcio transparency log (rekor inclusion proof
preserved in the bundle).

## Operator-cost

$0. GH Actions included minutes + sigstore (free) + R2 included
quota + Workers-Paid included.

## Wave-2 scope vs MVP

Wave 2 child 6 ships the pipeline structure with a single tier
(`governance-30kb`). Wave 4 child 7 (constitution compressor)
extends to all four tiers and adds the deterministic top-k
extractive Stage-1 + reasoning-grounded Stage-2 gate. Wave 4
child 9 wires `slsa-verify.js` into the Worker `/mcp` route's
serving path.

## References

- HAMR v3.2 §5 child 6 + §R3: `research/hamr-v3-2-2026-05-04.md`
  (#890).
- v3.2.1 §R9.4: `research/hamr-v3-2-1-2026-05-05.md` (#907).
- S6 build-vs-adopt: `research/hamr-spike-s6-build-vs-adopt-2026-05-04.md` (#881).
- Implementation: this PR (#912).
