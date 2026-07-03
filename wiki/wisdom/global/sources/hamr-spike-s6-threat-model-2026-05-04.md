---
title: "HAMR Spike S6 — STRIDE Threat Model 2026-05-04"
type: source
created: 2026-05-04
updated: 2026-05-04
tags: [hamr, threat-model, stride, security, dpop, slsa, cosign, oauth, fleet, supply-chain, governance]
sources: [raw/articles/hamr-spike-s6-threat-model-2026-05-04.md]
related: ["[[hamr-v3-2026-05-04]]", "[[hamr-spike-s1-code-audit-2026-05-04]]", "[[dpop-binding]]", "[[slsa-bundle-verification]]"]
status: draft
---

# HAMR Spike S6 — STRIDE Threat Model 2026-05-04

## Summary

Formal STRIDE threat model for HAMR v3 across 5 adversary classes (A1–A5) and
6 STRIDE categories (30 total cells). 8 cells remain MEDIUM or HIGH after
existing HAMR mitigations. 4 required design changes identified.

## Adversary Classes

| Class | Description |
|---|---|
| A1 | Compromised Cloudflare account (Worker + R2 write access) |
| A2 | Leaked operator JWT (DPoP-bound, exfiltrated from `identity.json`) |
| A3 | Malicious fleet model (poisoned `qwen2.5:7b-instruct` Ollama image) |
| A4 | Supply-chain attack on published bundle (npm or GitHub release asset) |
| A5 | MCP client OAuth replay (captured authorization code or refresh token) |

## Residual Risk Summary

| Adversary | S | T | R | I | D | E | MEDIUM+ count |
|---|---|---|---|---|---|---|---|
| A1 | LOW | MEDIUM | LOW | LOW | LOW | MEDIUM | 2 |
| A2 | MEDIUM | LOW | LOW | LOW | LOW | LOW | 1 |
| A3 | MEDIUM | MEDIUM | LOW | MEDIUM | LOW | HIGH | 4 |
| A4 | LOW | MEDIUM | LOW | LOW | LOW | LOW | 1 |
| A5 | MEDIUM | LOW | LOW | LOW | LOW | LOW | 1 |

Total MEDIUM+ residuals: **8 of 30 cells.**

## Required Design Changes

**DC-1 — R2 Mailbox Message Signing (A1-T)**
HMAC-SHA256 or Ed25519 signature over each A2A envelope before R2 write.
Worker `/mailbox/read` verifies before processing. Scope: child 5.

**DC-2 — Mandatory SLSA Bundle Verification in `hamr:doctor` (A1-E, A4-E)**
`hamr:doctor` runs `slsa-verifier verify-artifact` before reporting `hamr ok`.
MCP clients must not connect with unverified bundle. Scope: children 1 and 8.

**DC-3 — DPoP Key Hardware Binding (A2-S)**
Use Secure Enclave (macOS) or TPM2 (Linux) for DPoP private key storage.
Fallback to OS keychain with 4h JWT TTL where hardware binding unavailable.
Scope: child 2 (identity module write path).

**DC-4 — Cryptographic Signing of Governance Artifacts (A3-S, A3-T, A3-E)**
Ed25519 signature over all baton handoff artifacts; `sig:` field in GitHub issue
comments. Label-lint CI verifies signature before accepting baton state
transition. Judge gate in `cascade-dispatch.js` must use a non-fleet cloud model
for governance-critical verification. Scope: cross-cutting (children 8, 9,
`agent-signature.js` extension).

## Cross-Cutting Findings

- A3 (malicious fleet model) is the highest-risk adversary class with 4 MEDIUM+
  residuals; root cause is absence of cryptographic integrity for fleet model
  outputs in governance paths.
- DPoP binding (RFC 9449) + 24h TTL is the most effective recurrent mitigation
  pattern, closing or reducing 8 of 30 cells.
- SLSA-L3 + Cosign Bundle 1.0 verification (A1, A4) is effective only if DC-2
  enforces client-side verification before MCP connect.

*Source: raw/articles/hamr-spike-s6-threat-model-2026-05-04.md*

See: [[hamr-v3-2026-05-04]], [[hamr-spike-s1-code-audit-2026-05-04]],
[[dpop-binding]], [[slsa-bundle-verification]], [[governance-artifact-signing]]
