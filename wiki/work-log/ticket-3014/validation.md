# #3014 — Validation (governance evidence-bridge parity, Phase C)

**Branch:** feat/3014-evidence-bridge · **Base:** origin/main · **Parent:** Epic #3008
**Files:** scripts/governance-evidence-bridge.js (+AC2/AC3/AC4 + verify CLI), scripts/governance-evidence-bridge.spec.js,
scripts/governance-evidence-bridge.spec.md, scripts/baton-artifact-governance.js (graceful megalint fallback),
scripts/baton-artifact-governance.spec.js, inventory/harness-self-test-registry.json (+2),
.github/workflows/governance-evidence-bridge.yml.

## Result
- node --check clean. Registry JSON valid.
- Specs: **10/10 pass** — governance-evidence-bridge 5/5 (AC1 bridging, AC2 parity+TTL, AC3 completeness,
  AC4 diagnostics), baton-artifact-governance 5/5 (load + finders + graceful fallback). Hermetic.
- **Latent breakage fixed:** `baton-artifact-governance` required the out-of-repo
  `megalint/signer-registry-check` (absent on main) → the bridge and every consumer were unloadable.
  Now a graceful `MODULE_NOT_FOUND` fallback keeps the artifact finders working (signer/alias validation
  degrades to a safe no-op until megalint is restored). Full behavior preserved when the module exists.
- AC2 proved: parity ok on a clean snapshot, fails on a tampered field; TTL fresh/stale + fail-safe on
  unparseable timestamp.
- AC3 proved: full collaborator gate complete; missing field + absent required role flagged.
- AC4 proved: clean+fresh+complete ⇒ no findings; else EB_PARITY(high)/EB_STALE/EB_MISSING_FIELD with remediation.
- validator-discipline OK (both modified scripts ship sibling spec + registry entry).
- enforcement-wiring-audit: governance-evidence-bridge + baton-artifact-governance both **ENFORCED**.
- Content-only changeset (ticket-3014 files + shared registry line).
- Cross-family consensus **PASS** — receipt `d405d8a919bd46ee` (meta+mistral, $0 free-cloud).

## AC status (maps to #3014)
- AC1 [x] auto-generate evidence-bridge fields (pre-existing; regression-locked).
- AC2 [x] freshness TTL + content-hash parity checks.
- AC3 [x] evidence completeness across role gates on staged issues.
- AC4 [x] diagnostics for missing/stale fields with actionable remediation.
- AC5 [x] sibling specs + registry entries + CI enforced root; validator-discipline OK.
- AC6 [x] free ≥2-family cross-model consensus PASS — d405d8a919bd46ee.

## Scope note
Completes the #3014 code that shipped via the #3818 L6 capture (PR#45) with only AC1 and no tests. The
baton-artifact-governance change is an in-scope unblocker (the bridge's sole load-time dependency); it
adds graceful degradation only — no baton-field semantics changed.
