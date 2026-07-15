# Manager Scope — #3806 (E3:+ownership-guard — AT4 ownership *coverage*)

- **Role:** Manager
- **Ticket:** #3806 (mirror-mode; wiki-B mirror, no live GitHub issue)
- **Epic lineage:** E3 (ownership/accountability, Epic #2345 AC3; design synthesis #2346 §5)
- **Branch/worktree:** feat/3806-ownership-coverage / ~/wt-3806
- **Base:** origin/main @ 057f68e (through PR #17)
- **Accountable team:** claude-code

## Problem / gap

`scripts/accountable-team-verify.js` today enforces three ownership invariants:

- **AT1** malformed `accountable-team:*` value
- **AT2** more than one `accountable-team:*` label on one ticket
- **AT3** a terminal/backlog non-epic ticket carrying a transient `role:*` label

All three are *hygiene / inverse* checks. None of them answers the positive
ownership-**coverage** question the model was built for: *"is there an
active-execution ticket that nobody is accountable for?"* An in-flight ticket
with zero `accountable-team:*` labels is exactly the drift the accountability
model is meant to prevent, yet it is currently invisible.

Live signal is NOT degenerate: mirror tickets `#3799` and `#3800` are `OPEN`
(non-terminal) and carry no `accountable-team:*` label — AT4 flags real,
present ownership gaps, not just a forward-looking guard.

## Scope (this ticket ONLY)

1. Add **AT4 — `AT4_active_ticket_no_owner`** to `verifyTickets()` in
   `scripts/accountable-team-verify.js`:
   - Applies to **non-epic** tickets only (Epics are ownership-exempt, matching AT3).
   - Fires when the status is **active** — non-empty AND not starting with any
     `NON_ACTIVE_STATES` prefix (backlog/queued/ready/done/cancelled/closed) —
     AND the ticket carries **zero** `accountable-team:*` labels.
   - `warning` severity only; the CLI keeps its advisory-first contract (always exit 0).
2. Ship the **missing sibling spec** `scripts/accountable-team-verify.spec.js`
   covering AT1/AT2/AT3/AT4 (closes a validator-discipline (#1893) gap: the
   verify validator currently has neither a sibling spec nor a registry entry).
3. Register it in `inventory/harness-self-test-registry.json`
   (`{ "name": "accountable-team-verify", "spec": "scripts/accountable-team-verify.spec.js" }`).

## Out of scope (explicit)

- No new duplication of AT1–AT3 logic.
- No promotion to a hard gate — AT4 is advisory-first; promote only after a
  shadow period (< 2% FP), matching the established advisory-then-promote pattern.
- No change to `governance-verify.js` wiring: `accountable-team-verify` is already
  wired (line ~91; advisories surfaced ~191–193), so AT4 warnings flow through
  automatically. Wiring is *verified*, not modified.
- Ghost E2 tickets (#2275/#2632/#3066) — not materialized; not this ticket.

## Acceptance criteria

- **AC1** AT4 flags a non-epic active ticket with no accountable-team label; does
  NOT flag: Epics, terminal/backlog tickets, or active tickets that already have a
  valid `accountable-team:*` label.
- **AC2** CLI still exits 0 (advisory-first preserved).
- **AC3** `scripts/accountable-team-verify.spec.js` self-executes, exits non-zero on
  any assertion failure, uses only Node built-ins (`assert`), covers AT1–AT4.
- **AC4** `accountable-team-verify` present in harness-self-test-registry.json.
- **AC5** Enforcement surface stays 0-unwired (`enforcement-wiring-audit.js`);
  telemetry baseline refreshed after wiring.

## Verification gates

- Hermetic: `git archive <branch> | tar -x -C /tmp/ci` then
  `node scripts/accountable-team-verify.spec.js && node scripts/governance-verify.spec.js`
  GREEN on a clean `.git`-less tree.
- `node scripts/enforcement-wiring-audit.js` → 0 unwired.
- Independent: cross-family consensus review (groq+mistral ≥2-family PASS); cite receipt.

## Baton plan

Manager (this doc) → Collaborator (implement + spec + registry) → Admin
(hermetic CI green, PR, squash-merge to unprotected main) → Consultant
(independent closeout + cross-family receipt).
