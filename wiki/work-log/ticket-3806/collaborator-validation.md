# Collaborator Validation — #3806

- **Role:** Collaborator
- **Branch:** feat/3806-ownership-coverage @ e7f7e3a
- **Accountable team:** claude-code

## Changes delivered

| File | Change |
| --- | --- |
| `scripts/accountable-team-verify.js` | +AT4 `AT4_active_ticket_no_owner`; header comment updated to four invariants |
| `scripts/accountable-team-verify.spec.js` | NEW sibling spec, AT1–AT4 + exemptions + parse wiring + robustness |
| `inventory/harness-self-test-registry.json` | +`accountable-team-verify` entry |
| `wiki/work-log/tickets/3806.md` | mirror ticket (owned: `accountable-team:claude-code`) |

## AT4 semantics (as implemented)

Fires when **all** hold: status is non-empty AND not terminal/backlog
(`NON_ACTIVE_STATES`), ticket is **not** an Epic, and it carries **zero**
`accountable-team:*` labels. Empty/unknown status is deliberately NOT flagged
(a parse gap must not manufacture a false owner-gap). Advisory-only.

## Evidence (all GREEN in ~/wt-3806)

- `node scripts/accountable-team-verify.spec.js` → all assertions passed (AT1–AT4).
- `node scripts/accountable-team-verify.js` → exit 0 (advisory-first preserved);
  real finding: `⚠ 3799.md [AT4_active_ticket_no_owner]`. #3800 correctly exempt
  (`type:epic`).
- `node scripts/governance-verify.spec.js` → 7 assertions passed (AT4 advisories flow
  through the existing wiring unchanged).
- `node scripts/enforcement-wiring-audit.js` → 21/21 enforced, 0 UNWIRED.
- `node scripts/enforcement-telemetry.js` → 21/21, ratio 1, 0 unwired; baseline
  byte-identical (no regression, no baseline change).

## Hermetic proof

`git archive feat/3806-ownership-coverage | tar -x -C /tmp/ci` then
`node scripts/accountable-team-verify.spec.js && node scripts/governance-verify.spec.js`
→ both GREEN on a clean `.git`-less tree (Node built-ins only).

→ Handoff to Admin.
