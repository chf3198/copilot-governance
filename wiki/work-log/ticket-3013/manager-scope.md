# #3013 — Manager Scope: Phase B — HAMR tool-surface proxy least-privilege completion

**Type:** feature/guardrail · **Area:** governance/scripts · **Priority:** P1
**Parent:** Epic #3008 (Upgrade HAMR capability parity for fleet offload) · **Refs (bare):** Epic #3008,
Phase-0 #3009 (research-delivered), Phase A #3012 (context envelope, done), #2847 fleet-mcp-tools
default-deny catalog, #2791 fleet-MCP read-only tools, validator-discipline #1893, #3818 L6 capture (PR#45).

## Context (drift finding)
The #3013 deliverables — `scripts/hamr-tool-proxy.js`, `scripts/hamr-tool-policy.js`,
`scripts/hamr-tool-audit.js` — already reached `origin/main`, but via the #3818 L6 **live-harness
baseline capture** (commit 8d3766e / PR#45), not this child's baton cycle. The capture was faithful/
content-only, so the ticket shipped WITHOUT satisfying its own Validation ACs and with a live defect:

- `hamr-tool-policy.loadPolicy()` does `JSON.parse(fs.readFileSync(cfgPath))` against
  `../../config/hamr-tool-allowlist.json`, a runtime path that does not exist and is not shipped →
  **every call throws at runtime** (unlike sibling `authorization-profile.js`, which falls back to a
  built-in default when its external config is absent). The role-scoped allow-list therefore never
  enforces anything — it hard-crashes.
- No policy/proxy/audit regression specs exist (the #3013 Validation section requires unit + e2e tests).
- No `harness-self-test-registry` entry (validator-discipline #1893).

## Objective
Complete #3013 to its ACs by (a) fixing the loader defect with a **built-in least-privilege
`DEFAULT_POLICY`** (absent/malformed external override → safe default, matching the repo's
external-config-with-in-code-default convention), and (b) shipping the missing regression coverage +
registry entry + CI enforcement so the tool-surface proxy is governed and tested.

## Design
`scripts/hamr-tool-policy.js`:
- Add `DEFAULT_POLICY`: least-privilege role→tool grants over the #2847 default-deny catalog. Read tools
  (`github_read`, `wiki_search`, `repo_map`) for every offload role; the single `github_self_comment`
  write ONLY for the two roles that post fleet advisories (collaborator, consultant). manager/admin
  read-only as a fleet identity. `workflows` = the governed offload tool-classes.
- `loadPolicy(cfgPath)`: try the external override; on absent/unreadable/malformed/roles-less config
  fall back to `DEFAULT_POLICY` (no throw). A valid external config still wins (behavior preserved).

Regression coverage (self-executing `node:test` specs, hermetic, exit 1 on failure):
- `scripts/hamr-tool-policy.spec.js` — catalog default-deny passthrough, role-scope allow/deny,
  default-fallback on missing/malformed config, external-override precedence, workflowCompliance ≥0.99
  for offload roles.
- `scripts/hamr-tool-proxy.spec.js` — e2e approved call (policy→broker→audited envelope) and blocked
  call (policy deny → no broker invocation, audited), audit-trail assertions (injected tmp log + broker).
- `scripts/hamr-tool-audit.spec.js` — append/read round-trip, read-limit tail, complianceRate window.

Wiring: `scripts/hamr-tool-policy.spec.md` doc, one `harness-self-test-registry` entry (hamr-tool-policy),
CI workflow `.github/workflows/hamr-tool-policy.yml` running all three specs as a hard gate (the enforced
root that makes the scripts ENFORCED per enforcement-wiring-audit).

## Acceptance criteria (maps to #3013)
- [ ] AC1 capability allow-list + deny-list enforcement — default-deny catalog (#2847) + role-scoped
      allow-list with a working least-privilege default; unit-tested.
- [ ] AC2 least-privilege capability scopes mapped to role/task classes (manager/collaborator/admin/consultant).
- [ ] AC3 audited invocation logs with policy decision reason fields (proxy e2e proves audit rows on allow+deny).
- [ ] AC4 offload workflow classes executable with policy compliance >99% for offload roles (workflowCompliance test).
- [ ] AC5 sibling specs + registry entry + CI enforcement (validator-discipline #1893; enforcement-wiring-audit ENFORCED).
- [ ] AC6 free ≥2-family cross-model consensus; receipt recorded.

## Rails
Reversible, autonomous per operator directive (feature branch, restrictive least-privilege default =
hardening not weakening, no protected-main direct write). No carve-out. Does not broaden the #2847 tool
catalog or the ALLOWED_PERMS boundary — role grants are a strict subset of the existing default-deny catalog.

Signed-by: Orla Mason
Team&Model: claude-code:opus@local
Role: manager
