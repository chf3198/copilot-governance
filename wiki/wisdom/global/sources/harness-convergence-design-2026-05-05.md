---
title: Megingjord Harness Convergence Design v1
type: source
created: 2026-05-05
updated: 2026-05-05
tags: [convergence, governance, tooling, fleet, hamr, dashboard, multi-team]
related: ["[[hamr-core-worker]]", "[[cache-adapters]]", "[[header-spillover]]", "[[substrate-health]]", "[[baton-protocol]]"]
status: approved
---

# Megingjord Harness Convergence Design v1

## TL;DR

Approved cross-team architecture for the Megingjord harness as of 2026-05-05.
3 teams (Codex / Copilot / Claude Code) reached convergence in 9 rounds on
Epic #922 with 3 consecutive SIGN_OFFs.

## Canonical 9-item summary

1. 4 axes: governance / tooling / fleet / HAMR.
2. Dashboard = observation/control plane (NOT a 5th axis).
3. HAMR = shared substrate; Claude Code Team = primary maintainer; consumers integrate via `hamr-provider-wrapper` contract.
4. `substrate-health` gates `model-routing-engine` UPSTREAM of `cascade-dispatch` via `cascade-policy-overrides.json`.
5. Per-team config markers carry `axis_consumers` declaration.
6. `SKILL.md` frontmatter is canonical; `.codex/AGENTS.md` + `.github/copilot-instructions.md` views auto-derive (Codex-Team-owned, read-only on SKILL.md).
7. Cross-team edits on `instructions/`, `inventory/`, `wiki/` go through baton + governance-lint warn.
8. `megingjord-coord` deprecation = separate Epic.
9. Dashboard HAMR opt-in (#966) = downstream Epic.

## Source

- `research/harness-convergence-design-2026-05-05.md`
- Epic #922 rounds 1–9.

## Related concepts

- [[hamr-core-worker]] — the HAMR substrate referenced in items 3, 4.
- [[cache-adapters]] — provider-wrapper integration target.
- [[header-spillover]] — substrate-health-driven spillover.
- [[substrate-health]] — fleet axis input.
- [[baton-protocol]] — cross-team handoff mechanism.

## Decisions baked in

- Strict-superset preserved: no existing canonical files require destructive edits.
- Disjoint surfaces: Copilot Team owns dashboard; Claude Code owns HAMR; Codex owns governance lint + ADRs.
- Shared surfaces (`instructions/`, `inventory/`, `wiki/`) require cross-team baton handoff.
