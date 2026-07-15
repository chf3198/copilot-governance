# Epic #3818 — Lot L8 (scripts · baton + epic + ticket) Validation

**Lot:** L8 — `^scripts/(baton|epic|ticket)-` · **Branch:** `feat/3818-L8-capture` · **Base:** `origin/main` (3afa78e)
**Disposition:** faithful, content-only capture. Nothing held/discarded.

## Segment research (2025–2026, $0 web pass)

Validated the running baton/epic/ticket logic against current best practice for workflow state
machines + saga handoff integrity: state machines enforce valid transitions (integrity), saga
orchestration pairs each forward step with an **idempotent compensator**, handoff contracts declare
incoming/outgoing artifact dependencies with success/failure/iteration/escalation conditions, and
idempotency keys + optimistic locking make transitions safe to retry (no-op on repeat). The captured
baton progression checks (contiguous, time-ordered, gap/out-of-order rejection) and epic-child
traceability align with this. No hold/discard candidates. Sources: AWS Prescriptive Guidance saga
orchestration · dzone modelling-saga-as-a-state-machine · conduktor saga pattern · temporal.io durable
execution.

## Capture result

- **Manifest:** 45 files (`rollback/L8.manifest`) — all `??` (new/untracked) in the canonical checkout.
- **cmp vs canonical source:** 45/45 **cmp-clean, 0 mismatches**.
- **Staged:** **45 files** = 22 `baton-*`, 14 `epic-*`, 6 `ticket-*` (incl. 2 `.spec.js` self-tests +
  1 `ticket-reconcile-baseline.json`). No no-op files (all genuinely new vs origin/main).
- `rollback/L8.pre.patch` empty by design — all files untracked, so no tracked base to diff; the
  manifest + captured content is the record.

## Rollback compensator (written BEFORE capture)

- `rollback/L8.manifest` — 45-entry file list. `rollback/L8.pre.patch` — empty (all untracked).
- Pre-merge revert: `gh pr close` + delete `feat/3818-L8-capture` + `claim/3818-L8`.
- Post-merge revert: `git revert -m 1 <merge-sha>` PR (never force-push main).

## Test gate — GREEN

- `node --check` — 45/45 `.js` OK.
- JSON parse — `ticket-reconcile-baseline.json` OK.
- Lot self-tests: `baton-e2e.spec.js` PASS (AC1–AC5, incl. negative out-of-order/gap/reopen);
  `epic-child-baton-traceability.spec.js` **8 passed, 0 failed**.
- Content-only assertion — staged set is only `scripts/**` (L8 glob) + `epic-3818/` docs; no stray hunks.
- `node scripts/governance-verify.js` — **PASS**.
- `node scripts/validator-discipline.js --base origin/main` — **OK**, no unguarded validators (every
  captured *validator* ships its spec + registry entry).
- `node scripts/enforcement-wiring-audit.js` — exit 0. **Advisory (non-blocking):** 37 UNWIRED, up
  from 28/28, because the newly-captured baton/epic/ticket scripts are **operational CLIs invoked
  directly** (baton-back, baton-signing, epic-scaffold-cli, ticket-create, …), not reachable from an
  enforced workflow/hook/registry root. This is the **faithful** state of these tools — captured
  as-is per *hold-don't-fix*. See follow-up below.

## Cross-family consensus

- **Receipt:** `92055edc2ebfbbb9` · **consensus: PASS** (also earlier confirming run `0` receipt above).
- Families (≥2 distinct non-Anthropic): **meta** (groq) PASS, **mistral** PASS.

## Holds / discards / follow-ups

- **Holds/discards:** none — faithful capture.
- **Follow-up (advisory, not fixed inline):** wire or retire the 37 UNWIRED captured scripts flagged by
  `enforcement-wiring-audit` (baton/epic/ticket operational CLIs). Recorded here rather than filed as a
  blocking edit, consistent with the content-only capture rule; the audit is advisory-first (#3802) and
  does not block merge. A dedicated wiring/retire ticket can be raised post-capture once the full drift
  is on `origin/main`.
