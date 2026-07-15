# Collaborator Validation — #3799-AC2

- **Role:** Collaborator
- **Branch:** feat/3799-ac2-reversible-classifier @ b6e7ef3
- **Accountable team:** claude-code

## Delivered

| File | Change |
| --- | --- |
| `scripts/autonomy-classifier.js` | NEW — `classifyStep` / `classifySteps` taxonomy + `parseAutonomyDecision` + `verifyAdminDocs`/`scanAdminDocs` advisory + CLI |
| `scripts/autonomy-classifier.spec.js` | NEW sibling spec (truth table + fail-safe + AUT1/AUT2 + robustness) |
| `scripts/governance-verify.js` | wire AC2 advisory (default-on, `AUTONOMY_CLASSIFIER_ADVISORY=0` silences, try/catch, never in `issues`) + `autonomyAdvisories` result field + CLI print |
| `inventory/harness-self-test-registry.json` | +`autonomy-classifier` entry |
| `inventory/enforcement-telemetry-baseline.json` | refreshed 21→23 (absorbs #3805 mirror-ticket-lint + this validator) |

## Taxonomy verified (classifyStep)

- reversible: feature-branch push, PR open/update, squash-merge to **unprotected** main.
- carve-out (escalate): merge to **protected**/production, `irreversible`, `securityWeakening`.
- fail-safe: unknown protection / unknown action / empty / null ⇒ carve-out (never
  weakens a genuine carve-out — AC2 non-goal).

## Advisory (low-FP by construction)

Validates only Autonomy-Decision markers that ARE logged: `AUT1_malformed_autonomy_decision`,
`AUT2_carveout_auto_merged`. Docs with no marker → no finding. **0 findings on the
current baton corpus.**

## Evidence (GREEN in ~/wt-3799ac2)

- `node scripts/autonomy-classifier.spec.js` → all assertions passed.
- `node scripts/autonomy-classifier.js --step '{"action":"merge","protectedTarget":true}'`
  → CARVE-OUT / ESCALATE; `protectedTarget:false` → REVERSIBLE / COMPLETE autonomously.
- `node scripts/autonomy-classifier.js` (scan) → 0 warnings, exit 0.
- `node scripts/governance-verify.spec.js` → 7 assertions passed.
- `node scripts/enforcement-wiring-audit.js` → 23/23 enforced, 0 UNWIRED.
- `node scripts/enforcement-telemetry.spec.js` → 10 checks passed (no regression).
- Hermetic: `git archive … | tar -x -C /tmp/ci2` then both specs GREEN on a clean
  `.git`-less tree (Node built-ins only).

→ Handoff to Admin.
