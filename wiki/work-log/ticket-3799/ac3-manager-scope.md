---
title: "#3799-AC3 — MANAGER_SCOPE: deterministic mirror-ticket Admin-completion contract + guard"
type: work-log
role: role:manager
ticket: 3799
ac: AC3
lane: lane:code-change
created: "2026-07-14"
status: OPEN
---

# #3799-AC3 — Manager scope: mirror-ticket Admin-completion semantics

> Parent: #3799 (enforce full Agile role-workflow completion as default). AC1 shipped PR #11, this is
> **AC3**, worked as its own branch/PR (per-AC pattern, matching AC1). Mirror-mode (no live issue).

## AC3 (verbatim from #3799)

> Define deterministic Admin-completion for a wiki-mirror ticket with no live GitHub issue (PR body
> references the mirror path in lieu of `Closes #N`; a mirror-close step flips the ticket file
> status). Documented + validated.

## Problem evidence (why this is real, not degenerate)

The DONE mirror tickets on `main` are **inconsistent** in what "Admin-complete" means. Surveyed
2026-07-14:

| mirror ticket | status | receipt | PR/mirror ref | consultant closeout |
|---|---|---|---|---|
| #1893 | DONE | ✓ | ✓ | **MISSING** (no inline marker, no sibling file) |
| #3801 | DONE | ✓ | ✓ | sibling `ticket-3801/consultant-closeout.md` |
| #3802 | DONE | ✓ | ✓ | sibling `ticket-3802/consultant-closeout.md` |
| #3803 | DONE | ✓ | ✓ | sibling `ticket-3803/consultant-closeout.md` |
| #3804 | DONE | ✓ | ✓ | inline `CONSULTANT_CLOSEOUT` + sibling |

Without a defined contract, "flip to DONE" is done ad hoc: #1893 is terminal with no materialized
closeout, others put it inline vs in the sibling baton dir. That non-determinism is the exact friction
#3799 was filed to fix. `governance-verify` cannot catch it — it scans the flat `tickets/` dir (empty
on this layout), never `wiki/work-log/tickets/`.

## Deliverable (enforcement-first)

1. **Contract (documented).** A DONE (terminal, non-Epic) wiki-mirror ticket
   (`wiki/work-log/tickets/<N>.md`) is *Admin-complete* iff it carries ALL of:
   - **C1 receipt** — a cross-family consensus receipt (16-hex token, or the word "receipt").
   - **C2 mirror-completion reference** — a PR / mirror-mode completion reference (in lieu of
     `Closes #N`): `PR`, `pull/<n>`, or `mirror-mode` / mirror-path citation.
   - **C3 consultant closeout** — EITHER an inline `CONSULTANT_CLOSEOUT` marker OR a sibling
     `wiki/work-log/ticket-<N>/consultant-closeout.md`.
   Documented in the mirror ticket + module header (the deterministic Admin-close checklist).
2. **Guard (validated).** `scripts/mirror-admin-completion.js` — pure `verify(records)` + a
   `scanMirror(root)` that builds records (incl. sibling-closeout FS check); reports C1/C2/C3
   violations for DONE mirror tickets. Advisory-first (§3g): CLI exits 0, prints the burndown.
   `--json` supported. Wired into `governance-verify` as a default-on advisory sub-check
   (`MIRROR_ADMIN_ADVISORY`), never contributing to `issues`.
3. **Validator-discipline (#1893).** sibling spec + `harness-self-test-registry.json` entry.
4. **Hermetic.** Node built-ins only; clean-tree archive spec run GREEN.

## Acceptance criteria (AC3 sub-ACs)

- [ ] SA1 contract documented (module header + this scope) with the 3 deterministic conditions.
- [ ] SA2 `verify(records)` flags C1/C2/C3 violations; pure, deterministic, no I/O.
- [ ] SA3 `scanMirror(root)` parses mirror tickets + resolves sibling closeout; CLI advisory (exit 0).
- [ ] SA4 wired into `governance-verify` default-on advisory; never alters pass/fail; env-silenceable.
- [ ] SA5 spec + registry entry; `enforcement-wiring-audit` reports the new validator ENFORCED (0 unwired preserved).
- [ ] SA6 hermetic clean-tree archive run GREEN.
- [ ] SA7 cross-family consensus PASS; receipt recorded.

## Non-goals

- Remediating the *content* of already-DONE tickets (#1893 etc.) — that is a separate follow-up;
  touching other tickets' files is out of scope (§3a). This ticket delivers the contract + guard;
  the burndown surfaces violators advisory-first.
- Promoting the guard to a hard block (advisory-first; promote after low-FP soak).
- Reconciling the `#N` mirror universe to real GitHub issues (#3799 non-goal).

## Baton plan

Manager (this) → Collaborator (validator + spec + wiring + doc) → Admin (push → PR → CI → merge to
unprotected main; reversible ⇒ autonomous per AC2 taxonomy) → Consultant (critique + cross-family
receipt).

Related: parent #3799 (AC1 shipped PR #11), #1893 (validator-discipline), #3804 (advisory-wiring +
mirror Admin-completion exemplar), #3803 (governance-verify enforceable).
