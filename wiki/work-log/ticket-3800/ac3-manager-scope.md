---
title: "#3800-AC3 Manager scope — Epic-close-time remediation hint (reuse-first)"
type: work-log
role: MANAGER
ticket: 3800
ac: 3
created: "2026-07-15"
status: SCOPED
---
# #3800-AC3 — Manager scope

## AC3 criterion (verbatim from committed 3800.md)
> AC3: **Phase-1** — Emit an actionable remediation hint at Epic-close time (Manager/Admin baton
> path) naming the un-evidenced children.

## Disposition: reuse-first extension of the ALREADY-WIRED validator (no new validator, no baseline move)
Phase-0 shipped `scripts/epic-child-baton-traceability.js` (`auditEpics()` core, EB1/EB2/EB3
invariants) already wired into `governance-verify` (AC2, PR 12). AC3 is the close-time surface: when
an Epic is being closed, the Manager/Admin baton path needs a single, actionable, epic-scoped hint
that NAMES the specific un-evidenced children to remediate first — not the whole-corpus advisory dump.

Implement as an **extension of the existing enforced validator** (reuse `auditEpics`), NOT a new
script:
1. New exported pure fn `epicCloseHint(tickets, epicNumber)` → `{ epic, blockers:[{child,codes}], hint }`.
   Reuses `auditEpics()` and filters to the one epic being closed. Returns `hint:null` +
   `blockers:[]` when the epic is clean / not-a-closing-epic (NO noise — low-FP by construction, same
   predicate as the validated Phase-0 detector).
2. New CLI mode `--epic <N>` prints the close-time hint (exit 0, advisory-first) for the Admin/Manager
   baton path to invoke at close-time. Default (no flag) CLI behavior UNCHANGED.
3. New sibling-spec cases (`epic-child-baton-traceability.spec.js`) covering: hint names the right
   children; clean epic → null hint; non-epic / open-epic → null; CLI `--epic` mode.

## Acceptance gate for this AC
1. `epicCloseHint` implemented + exported; deterministic, pure, reuses `auditEpics`.
2. `--epic <N>` CLI mode prints an actionable child-naming hint (advisory, exit 0).
3. Sibling spec extended + green (hermetic clean-tree archive run).
4. Validator stays ENFORCED (enforcement-wiring-audit: still enforced, 0 unwired). Because this is an
   EXTENSION of an existing validator (no NEW validator file), the enforcement baseline STAYS 24 —
   do NOT run `--update-baseline` (telemetry must show unchanged count).
5. Cross-family ≥2-distinct-family PASS receipt; cited.
6. Flip AC3 `[ ]`→`[x]` on committed 3800.md; parent #3800 stays OPEN (AC4/AC5 remain).
7. Full baton artifacts under `wiki/work-log/ticket-3800/`.

## Constraints
- Touch ONLY #3800 files: `scripts/epic-child-baton-traceability.js` (+ its `.spec.js`),
  `docs/howto/epic-child-baton-traceability.md` (append AC3 note), `wiki/work-log/tickets/3800.md`,
  `wiki/work-log/ticket-3800/*`. Do NOT touch other validators.
- Advisory-first, LOW-FALSE-POSITIVE: emit a hint ONLY for a closing epic that has real
  un-evidenced closed children (reuse the validated predicate) — never keyword-scan prose.
- Reversible (feature push + PR + squash-merge to UNPROTECTED main) ⇒ autonomous completion (G8).
  Autonomy-Decision: reversible.
- AC3 is a close-time HINT, NOT a blocking gate — promotion to blocking is AC4 (needs shadow-FP
  metric + consensus per the Epic's hard gate). AC3 stays advisory.
