# #3014 — Manager Scope: Phase C — Automate governance evidence-bridge parity in HAMR

**Type:** feature/guardrail · **Area:** governance/scripts · **Priority:** P1
**Parent:** Epic #3008 · **Refs (bare):** Epic #3008, Phase A #3012, #3013 (Phase B, merged PR#54),
#3030 baton per-role finders, #3391 B3 autonomy_score field, validator-discipline #1893, #3818 L6 capture.

## Context (drift finding)
`scripts/governance-evidence-bridge.js` reached origin/main via the #3818 L6 baseline capture (PR#45),
faithful/content-only. It implements only **AC1** (auto-bridge baton artifacts → a governance-fields/v2
snapshot with a content hash). Its other three ACs are **unimplemented**:
- AC2 freshness TTL + content-hash **parity check** — the snapshot stamps a hash but nothing verifies it
  or flags staleness.
- AC3 completeness across role gates — no per-role required-field completeness evaluation.
- AC4 diagnostics — no actionable "missing/stale field" output.
There is also no spec, registry entry, or CI enforcement.

## Objective
Complete #3014 to its ACs by extending the module with parity verification, freshness TTL, per-role
completeness evaluation, and an actionable diagnostics function + verify CLI, then ship hermetic specs +
registry entry + CI enforced root. No new baton-field semantics — reuses `ROLE_FIELD_KEYS`
(governance-bundle-fields) and `entries` (baton-artifact-governance).

## Design (extends scripts/governance-evidence-bridge.js)
- Refactor the inline hash into `computeContentHash(snapshot)` (DRY) used by both bridging and verify.
- `verifyParity(snapshot) → {ok, expected, actual}` — recompute over `{issue, fields, generated_at}`;
  detects post-hoc edits to a governance-fields JSON (AC2 parity).
- `isStale(snapshot, {ttlMs, nowMs}) → bool` — snapshot older than the freshness window (default 24h);
  unparseable `generated_at` ⇒ stale (fail-safe) (AC2 TTL).
- `evaluateCompleteness(snapshot, {requiredRoles}) → {complete, roles:{role:{required,present,missing}}}`
  — per-role required `ROLE_FIELD_KEYS` coverage; `requiredRoles` gates a staged issue against roles that
  MUST have reported (AC3).
- `diagnose(snapshot, opts) → {ok, findings:[{code, severity, role?, field?, message, remediation}]}` —
  EB_PARITY / EB_STALE / EB_MISSING_FIELD with remediation text (AC4).
- `--verify <snapshotPath>` CLI prints the diagnosis; exit 0 (advisory) — hermetic.

## Acceptance criteria (maps to #3014)
- [ ] AC1 auto-generate evidence-bridge fields for baton artifacts into governance bundles (pre-existing; regression-locked).
- [ ] AC2 freshness TTL + content-hash parity checks (verifyParity + isStale, unit-tested incl. tamper + stale).
- [ ] AC3 evidence completeness across role gates on staged issues (evaluateCompleteness).
- [ ] AC4 diagnostics for missing/stale fields with actionable remediation (diagnose).
- [ ] AC5 sibling spec + registry entry + CI enforced root (validator-discipline #1893; enforcement-wiring-audit ENFORCED).
- [ ] AC6 free ≥2-family cross-model consensus; receipt recorded.

## Rails
Reversible, autonomous (feature branch; adds read-only verification/diagnostics; no protected-main direct
write; no new field semantics). No carve-out.

Signed-by: Orla Mason
Team&Model: claude-code:opus@local
Role: manager
