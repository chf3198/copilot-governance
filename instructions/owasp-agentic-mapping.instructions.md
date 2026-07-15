---
name: OWASP Agentic Top 10 Risk Mapping
description: Maps OWASP Top 10 for Agentic Applications (Dec 2025) to harness goals, current enforcement coverage, and candidate mitigations. Load when assessing agentic security posture.
applyTo: "**"
---

# OWASP Top 10 for Agentic Applications — Harness Mapping

Source: OWASP Top 10 for Agentic Applications (December 2025; 2026 effective).

## Risk Mapping Table

| # | Risk | Harness Goals | Current Coverage | Candidate Mitigation |
|---|---|---|---|---|
| OA1 | Goal Hijacking | G1 G2 | **Enforced** (#1972 `tests/fixtures/goal-hijack/` + fixture loader) | Promoted from Advisory by #1987 |
| OA2 | Tool Misuse | G1 G4 | **Enforced** (`pretool_guard.py`, permissions allowlist) | Per-tool blast-radius declarations |
| OA3 | Identity Abuse | G1 G4 | **Enforced** (`team-model-signing`, signer-alias-canonical) | Cross-family signer-independence tests |
| OA4 | Memory Poisoning | G2 G4 | **Enforced** (`memory-watchdog` + auto-memory schema validation) | Promoted from Partial by #1987 |
| OA5 | Cascading Failures | G6 | **Enforced** (header-spillover + sticky-route TTL + broker quarantine) | Promoted from Partial by #1987 |
| OA6 | Rogue Agents | G1 G9 | **Enforced** (broker quarantine, baton single-thread) | Inter-agent message tamper-evidence |
| OA7 | Supply Chain | G4 | **Enforced** (dependency-review, secret-scanning, cosign) | SLSA provenance + Artifact Attestation |
| OA8 | Insecure Communications | G4 | **Deferred** (DPoP for HAMR; cross-runtime mesh = separate Epic) | Goal-lens override: see OA8 Deferral Rationale below |
| OA9 | Human-Agent Trust Exploitation | G1 G8 | **Enforced** (`wiki/log.md` append-only ledger + closeout-schema validator) | Promoted from Advisory by #1987 |
| OA10 | Code Execution | G4 | **Enforced** (no LLM eval, no shell from prompts) | Sandbox boundaries auditable |

## OA8 Deferral Rationale

OA8 (Insecure Communications) is intentionally classified Deferred rather than Enforced. Goal-lens override: G4 (privacy) + G9 (interoperability) currently satisfied via DPoP-signed HAMR provider calls. Full cross-runtime zero-trust mesh (Claude Code ↔ Codex ↔ Copilot inter-agent message signing) requires a multi-Epic effort, out of scope for #1987. G3 (zero cost) and G7 (throughput) costs of the mesh upgrade exceed current threat-model justification: cross-runtime traffic is repo-local IPC, not network-exposed. Re-evaluated when any cross-runtime message becomes network-exposed (Tier-2 anneal trigger).

## Coverage Classification Legend

- **Enforced**: deterministic gate; blocks on violation
- **Partial**: guardrail present; gaps identified; advisory on breach
- **Advisory**: guidance required; no blocking gate today

## Relationship to Harness Goals

Every OA risk maps to one or more G1-G10 goals:

- G1 Governance: OA1, OA2, OA3, OA6, OA9
- G2 Quality: OA1, OA4
- G4 Privacy & Security: OA2, OA3, OA4, OA7, OA8, OA10
- G6 Resilience: OA5
- G8 Observability: OA9
- G9 Interoperability: OA6

**Operator autonomy (cross-cutting principle — Epic #3391):** the autonomy principle is
HARD-subordinate to G1 and G4, so it never relaxes an OWASP-Agentic control. Autonomy may not
auto-weaken a security/permission policy (C-G4) to avoid a human prompt — deliberate
security-policy weakening is one of the 4 retained human carve-outs, not operator territory.

## Sources

- Research: `research/goal-enforcement-2026-05-19.md` §2 (Phase-0 R1, Refs #1963 AC3)
- goteleport.com/blog/owasp-top-10-agentic-applications
- paloaltonetworks.com/blog/cloud-security/owasp-agentic-ai-security

## Related

- `wiki/wisdom/global/concepts/harness-goal-controls.md` — per-goal enforcement catalog with OWASP risk rows
- `instructions/harness-goals.instructions.md` — canonical G1-G10 definitions
- `instructions/global-standards.instructions.md` — always-loaded priority sentence
