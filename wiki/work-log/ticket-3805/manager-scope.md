# Manager scope — #3805

> Reconcile `governance-verify`'s legacy `# Ticket N —` ticket parser to the flat wiki-mirror
> frontmatter schema (the explicit deferred non-goal from #3803).
> Role: Manager | lane:code-change | area:governance, area:scripts | priority:P2

## Problem / provenance

`scripts/governance-verify.js` parses tickets with `parse(txt)`, which reads `<root>/tickets/*.md`
expecting a legacy header (`# Ticket N —`) plus inline `Status:` / `Priority:` / `Type:` fields.
On the flat `main` layout the real tickets live at `wiki/work-log/tickets/*.md` and use a **different
schema**: YAML frontmatter (`title: "#N …"`, `status:`) plus a `> **Labels**: …` line carrying
`priority:P#`, `type:*`, etc. Consequently `<root>/tickets/` does not exist, `files === []`, and the
core structural ticket lint reports `checkedTickets: 0` — a **silent no-op** over the real corpus
(1182 tickets). This is the deferred non-goal recorded when #3803 made `governance-verify` enforceable
("today ticket-lint is a safe no-op on flat main because the mirror tickets use different fields").

## Critical decision (to be ratified by cross-family consensus — AC5)

**Do NOT re-point the existing BLOCKING `parse()`/`dir` at the mirror.** The mirror `status:`
frontmatter is freeform and mirror-derived (corpus: 1005 `CLOSED`, 162 `OPEN`, plus a long freeform
tail: `READY`, `CLOSE-READY`, `DONE-RECONCILED`, `PHASE-0-COMPLETE`, …). Feeding that into the legacy
blocking invariants (terminal-status ⇒ require `## CONSULTANT_CLOSEOUT` + `## GitHub Evidence Block`;
require an inline `Priority: P#` line) would hard-fail ~1005 tickets — catastrophic over-flag.

Instead, follow the established advisory-scanner pattern already used by `accountable-team-verify`,
`epic-child-baton-traceability`, and `mirror-admin-completion`: add a **mirror-schema-aware parser +
advisory-only structural lint** (`scripts/mirror-ticket-lint.js`), wired default-on / **non-blocking**
into `governance-verify.js`. It applies only schema-appropriate, empirically low-FP invariants, with a
measured over-flag proof on the full corpus. The legacy `# Ticket N —` blocking parser is retained
unchanged as a forward-compatible no-op (harmless if a nested `tickets/` layout ever reappears).

## Acceptance criteria

- [ ] **AC1 — parser reconciliation.** A mirror-schema-aware parser reads the real flat corpus
      (`wiki/work-log/tickets/*.md`): pure `parseMirrorTicket(file, txt)` extracting `number`
      (filename + `title: "#N"`), `status` (frontmatter), `type`/`priority` (Labels line), and a
      placeholder flag; FS-backed `scanMirror(root)`. Replaces the silent `checkedTickets: 0` no-op.
- [ ] **AC2 — advisory lint, proven no over-flag.** Pure `lint(records)` applies ONLY schema-
      appropriate invariants, all emitted as `warning` (never `issues`). Empirical over-flag proof:
      aggregate warn rate **< 2%** of the 1182-ticket corpus (matching the `accountable-team`
      advisory promote-threshold precedent); a corpus-audit note is recorded in the ticket dir.
      Candidate invariants (final set fixed by the corpus measurement):
      MTL1 `number_mismatch` (title `#N` ≠ filename N); MTL2 `missing_status` (no `status:`);
      MTL3 `malformed_priority` (Labels line present but no valid `priority:P[0-3]`);
      MTL4 `placeholder_signature` (`PLACEHOLDER_SIGNATURE` present).
- [ ] **AC3 — wired, non-bypassable, self-tested.** Default-on advisory block in
      `governance-verify.js` (`MIRROR_TICKET_LINT_ADVISORY=0` silences; never touches the pass/fail
      verdict) + sibling `scripts/mirror-ticket-lint.spec.js` (Node built-in `assert`, self-executing,
      exit 1 on fail) + registry entry `mirror-ticket-lint` in
      `inventory/harness-self-test-registry.json`. `enforcement-wiring-audit` stays 0 UNWIRED;
      `governance-verify.yml` already exercises `governance-verify.js`.
- [ ] **AC4 — hermetic CI green.** `git archive <branch> | tar -x -C /tmp/ci` clean, `.git`-less tree
      ⇒ `node scripts/mirror-ticket-lint.spec.js` green (Node built-ins only; no `gh`/network/untracked).
- [ ] **AC5 — consensus.** The critical decision (advisory mirror-lint vs re-pointing the blocking
      parser) + the validator ratified by a free ≥2-distinct-family cross-model panel
      (`cross-family-consensus.js`), consensus PASS; receipt recorded.

## Non-goals

- Removing or rewriting the legacy `# Ticket N —` blocking parser (kept as forward-compatible no-op).
- Promoting mirror-ticket-lint to a hard block (deferred to a post-soak low-FP promotion, per §3g).
- Reconciling the `#N` mirror universe to real GitHub issues (out of scope).

## Verification gates

Hermetic spec green on clean archive · governance-verify still PASS (verdict unchanged) ·
enforcement-wiring-audit 0 UNWIRED · corpus warn-rate < 2% · cross-family PASS receipt cited ·
PR → CI green → squash-merge to (unprotected) main → mirror status flipped DONE.

Related: #3803 (deferred this non-goal; presence-tolerant flat-layout fix), #3802 (enforcement-wiring),
#1893 (validator-discipline: spec + registry), #2345/#3800/#3799-AC3 (advisory-scanner precedents).
