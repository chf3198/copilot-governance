---
title: "Judge Quorum"
type: concept
created: 2026-05-04
updated: 2026-05-04
tags: [hamr, judge, quorum, provenance]
sources: ["[[hamr-v3-2-2026-05-04]]"]
related: ["[[baton-protocol]]", "[[governance-enforcement]]", "[[fleet-architecture]]"]
status: draft
---

# Judge Quorum

A governance gate that requires agreement from two or more judges drawn from
**independent model families** before accepting a high-stakes result. The design
principle is **independence-by-supply-chain**, not cloud-vs-local locality: a judge
is valid if it cannot share a compromised model image with the work it is judging.

## Three Orthogonal Axes

The v3.1 design conflated these. v3.2 separates them explicitly:

| Axis | Values |
|---|---|
| Cost | free / paid |
| Locality | local-tailnet / remote-cloud |
| Provenance | unverified / vendor-attested / source-built / hardware-rooted |

A judge gate cares **only** about the provenance axis. A Tailscale-hosted Ollama
model with a signed manifest is a valid verified-provenance judge at zero token cost.

## Gate-Type Map (v3.2 §3.2)

| Gate type | Required judges |
|---|---|
| Routine routing (no governance impact) | Any 1 fleet model |
| Bundle integrity verification | SLSA verifier + Cosign (deterministic, no LLM) |
| Rule-coverage Stage-1 (every build) | Deterministic keyword check, no LLM |
| Rule-coverage Stage-2 (weekly) | Quorum of 2, different families |
| `CONSULTANT_CLOSEOUT` validation | Quorum of 2, different families, ≥1 verified-provenance |

## Agreement Protocol

1. Two judges from different families score the artifact (0..1).
2. `|score_A - score_B| ≤ 0.10` → agreement; return mean score.
3. `|score_A - score_B| > 0.10` → disagreement; caller may invoke `escalate()`.
4. `escalate()` selects a 3rd family not used by the two disagreeing judges.
5. If no 3rd family is available, returns `reason: 'no_third_family_available'`.

## Wave 1 Limitation

`scripts/global/judge-quorum.js` (#895) ships the family registry, gate-type
selection, and agreement logic. The `dispatcher` parameter is **required injection**
in Wave 1 — the module throws if no dispatcher is provided. Wave 4 will wire the
real cascade-dispatch adapter as the default dispatcher.

## Cross-References

- Spec: HAMR v3.2 redesign baseline #890 §3.2 (`research/hamr-v3-2-2026-05-04.md`)
- Threat context: HAMR Spike S6 #881 — A3-E HIGH (poisoned fleet model) eliminated by R1+R2+R3+quorum
- Execution: Wave 1 child #895 → Wave 4 wires real dispatch
