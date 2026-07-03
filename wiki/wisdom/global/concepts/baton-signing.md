---
title: Baton Signing
type: concept
created: 2026-05-04
updated: 2026-05-04
tags: [hamr, governance, ed25519, signing, baton, security]
related: ["[[hamr-v3-2-2026-05-04]]", "[[judge-quorum]]", "[[hamr-doctor]]", "[[capability-detection]]"]
status: draft
---

# Baton Signing

## Purpose

Cryptographic sign/verify for HAMR governance artifacts. Implements
remediation R1 from HAMR v3.2 (#890): every machine-emitted baton
handoff (`MANAGER_HANDOFF`, `COLLABORATOR_HANDOFF`, `ADMIN_HANDOFF`,
`CONSULTANT_CLOSEOUT`, `BLOCKER_NOTE`, `ADR_*`, `BUNDLE_PUBLISH`,
`MAILBOX_ENVELOPE`) carries an Ed25519 signature. The label-lint
gate (deferred to Wave 4) refuses unsigned or invalid-sig
transitions, preventing the S6 #881 A3-E HIGH residual (a poisoned
fleet model fabricates a `CONSULTANT_CLOSEOUT`).

## Module API

`scripts/global/baton-signing.js` (CommonJS, node:crypto only):

| Function | Purpose |
|---|---|
| `sign(artifact, options)` | Sign canonicalized artifact with the per-process Ed25519 key. Returns `{artifact, signature, key_id, timestamp, tier, publicKey}`. |
| `verify(signedArtifact, publishedKeys)` | Verify against a publisher keyring (`Map<key_id, base64-spki>`). |
| `emitTrailer(artifact, options)` | Append `signature:` / `key_id:` / `timestamp:` trailer for a GitHub comment. |
| `probeKeyTier()` | Probe the best available key-store tier (Q1 OS-agnostic ladder). |

## Canonicalization

Wave 1 uses a simplified JCS subset (full RFC 8785 deferred to
Wave 4 alongside child 7 compressor): NFC normalization, strip
trailing whitespace per line, collapse `\s+\n` → `\n`, trim ends.
Sufficient for governance text. Full JCS becomes important when
HAMR child 5 mailbox envelopes carry structured JSON.

## 4-tier OS-agnostic key store

| Tier | Storage | Probe (Wave 1) | OS coverage |
|---|---|---|---|
| T1 | Hardware enclave | `tpm2-tools` (Linux) / `security` (macOS) / `certutil` (Windows) presence | TPM 2.0 hosts; presence-only in Wave 1 |
| T2 | OS keychain | Dynamic import of `keytar` | macOS Keychain, Windows Credential Manager, Linux libsecret/KWallet/GNOME-Keyring |
| T3 | Age-encrypted file | `~/.megingjord/keys/operator-ed25519.age` + `age` CLI on PATH | Any OS — ChromeOS LXC, BSD, illumos all qualify |
| T4 | Ephemeral in-memory | Always available | Any environment incl. CI runners |

Wave 1 uses T4 always for actual signing. Binding to durable
keys is deferred to Wave 4 child 8 (`hamr:status` operator UX).

## No key material in outputs

Tested invariants:

- `sign()` result has no `privateKey` or `secretKey` field.
- No non-`publicKey` string field decodes to a 32-byte Ed25519 seed.
- Buffer comparisons used — no leaked timing channel.

## Trailer format

`emitTrailer(artifact)` produces:

```text
<artifact body>

signature: <ed25519-base64-unpadded>
key_id: op-<sha256-of-pubkey-hex-first-16>
timestamp: <iso-8601>
```

## References

- HAMR v3.2 §3.R1: `research/hamr-v3-2-2026-05-04.md` (#890).
- S6 STRIDE A3-E: `research/hamr-spike-s6-threat-model-2026-05-04.md` (#881).
- Implementation: `scripts/global/baton-signing.js` (#894).
- Tests: `tests/baton-signing.spec.js` (#894).
