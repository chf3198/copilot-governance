---
title: "Epic AC Reconciliation"
type: concept
created: 2026-05-09
updated: 2026-05-09
tags: [governance, epic-governance, acceptance-criteria, drift-detection]
sources: ["[[epic-state-truthfulness-rd-2026-05-09]]"]
related: ["[[epic-governance]]", "[[ticket-audit-pattern]]", "[[baton-protocol]]"]
status: draft
---

# Epic AC Reconciliation

The pattern of automatically reconciling Epic body Acceptance Criteria checkboxes (`- [ ]` / `- [x]`) against an evidence catalog (closed children, file existence, sensor outputs, time-windowed metric checks) so that AC state accurately reflects implementation reality without Manager-side checkbox-flipping.

## Why it exists

Manager narrative ("Epic complete") drifts from governance label state (`status:in-progress`) drifts from AC body state (`- [ ]` checkboxes never updated). AC reconciliation closes the gap between layer 1 (label) and layer 3 (checkboxes) deterministically, enabling a Manager-language linter on layer 2 (narrative) to detect divergence reliably.

## How it works

1. **Parse**: read Epic body, extract each `- [ ] AC<N>: <text>` line.
2. **Catalog**: build evidence catalog per Epic from closed children (Refs/Parent text-match), file paths mentioned in AC text, sensor outputs (governance-audit JSON, /quota), time-windowed metrics (post-merge measurement windows).
3. **Reconcile**: for each AC, attempt to match against evidence. Emit checked/unchecked + match-reason.
4. **Update**: write back to Epic body via `gh api -X PATCH`. Append a "AC reconciliation report" comment with delta.
5. **Gate**: `epic-close-readiness.yml` extension treats unmet ACs as equivalent to open children for re-open decisions.

## Constraints

- **Manager-forbidden**: Manager (the role) MUST NOT manually check AC boxes. Reconciler is the only writer.
- **Evidence-first**: a checkbox flips only when evidence is found; absence ≠ unmet (could be infrastructural; needs explicit `EPIC_RESCOPE` declaration).
- **Backwards compatible**: pre-existing Epics with stale `- [ ]` are grandfathered; reconciliation applies prospectively from instruction-merge date.

## Components

- `scripts/global/epic-ac-reconciler.js` — pure-function module (parse + reconcile)
- `.github/workflows/epic-ac-reconcile.yml` — trigger on Epic edit, child close, manual dispatch
- `instructions/epic-governance.instructions.md` — extended with EPIC_RESCOPE template and reconciler invocation rules

## Related work

- Jira Smart Checklists (HeroCoders) — template-driven AC tracking with automation triggers
- Xray + Jira integration — AC-as-evidence patterns
- GitHub Issue Forms Body Parser (peter-murray) — checkbox-aware issue body parsing
- Checkbox Workflow Action (wadackel) — checkbox-driven CI workflow precedent

## See also

- `[[epic-governance]]` — current Epic lifecycle this pattern extends
- `[[baton-protocol]]` — handoff lifecycle; reconciler runs at Epic close attempt
- `[[ticket-audit-pattern]]` — Manager-side audit pattern; complementary
