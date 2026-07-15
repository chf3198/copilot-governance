---
applyTo: "**"
---
# Cross-Family Review Contract — All Baton Roles

**Source**: research/cross-family-review-contract-2026-05-31.md | Refs #2511

## Core Rule
The reviewing model's AI **family** MUST differ from the implementing role's family.
Same-family review is self-review and is invalid. Anthropic ≠ Qwen ≠ DeepSeek ≠ OpenAI.

## AI Families
- Anthropic: `claude-*`
- OpenAI: `gpt-*`, `o1-*`, `o3-*`, `o4-*`
- Qwen: `qwen*`
- DeepSeek: `deepseek-*`
- Granite: `granite-*`

## Obligations by Role

### Collaborator (L2 — pre-COLLABORATOR_HANDOFF)
**REQUIRED** — blocks push (P) and CI merge (H).
1. Dispatch to fleet non-Anthropic model via `npm run collaborator:preflight`
2. Minimum: ≥7B model, 80/100 score. Review MUST include per-section feedback + ≥1 gap.
3. Fallback (G5): if no ≥7B available, 3B at 60/100 advisory-only.
4. MUST include in COLLABORATOR_HANDOFF:
   - `cross_family_reviewer: <model@host>`
   - `cross_family_rating: <N>/100`
   - `reviewer_family: <Family>`
   - `cross_family_findings: <findings>`
5. Fleet-first (G3): paid providers are NOT permitted as primary reviewers.
   Dispatch order: 36gbwinresource (100.91.113.16) → OpenClaw (100.78.22.13) → paid.
6. If all fleet nodes unavailable: defer (G6 advisory degradation); do NOT skip or
   substitute a same-family model. Record `fleet_unavailable: true` in COLLABORATOR_HANDOFF.
7. Secrets MUST be redacted before dispatch (config/redaction-patterns.json).

### Admin (L3 — receipt of COLLABORATOR_HANDOFF)
**REQUIRED** — CI hard-gate (H) via admin-handoff.js + signer-fidelity.js.
Extract `reviewer_family` from COLLABORATOR_HANDOFF; extract Collaborator family from
`Team&Model: <runtime>:<model>@<host>` (e.g. `copilot:claude-*` → Anthropic).
Gate fails if `reviewer_family` == Collaborator family. Include in ADMIN_HANDOFF:
`reviewer_family_verified: pass|fail`.

### Consultant (L4 — pre-CONSULTANT_CLOSEOUT)
**REQUIRED** — CI hard-gate (H) via signer-fidelity.js + baton-gates.yml.
1. Consultant family MUST differ from Collaborator AND Admin signer families.
2. Conduct own independent cross-family critique of the full deliverable.
3. MUST include in CONSULTANT_CLOSEOUT:
   - `cross_family_verdict: ACCEPT|PARTIAL|REJECT — <model@host> — <rationale>`

### Manager (L1, L5)
- L1: Optional pre-implementation orientation check (advisory only).
- L5: Tier-2 anneal if ≥2 sessions show same-family pattern (workflow-self-anneal).

## Enforcement Ladder
```
P (pre-commit): collaborator-preflight.js — blocks push if cross-family step absent
H (CI hard-gate): baton-gates.yml
  collaborator-gate: cross_family_rating + reviewer + findings fields required
  admin-gate: reviewer_family != Collaborator Team&Model family
  consultant-gate: cross_family_verdict present; Consultant family != Collaborator
A (advisory): L5 Tier-2 anneal on repeated same-family pattern
```

## Cross-Runtime Scope
Applies to Copilot, Codex, and Claude Code runtimes equally.
Fleet nodes: 36gbwinresource (100.91.113.16), OpenClaw (100.78.22.13).

## Observability
`cross_family_verdict` values are appended to `~/.megingjord/incidents.jsonl`
after merge (category `cross-family-audit`, tier=2) for Tier-2 self-anneal.

## Maintenance
Add a new model family via a single child ticket under Epic #2511. Update this
file + `scripts/global/megalint/signer-fidelity.js` family map in the same PR.

## Related Tickets
- #2438 (collaborator-preflight.js), #2439 (collaborator-handoff.js schema),
  #2510 (admin-handoff.js family check), Epic #2192 (consultant gate research)
