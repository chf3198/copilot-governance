# #3013 — Validation (HAMR tool-surface proxy least-privilege completion, Phase B)

**Branch:** feat/3013-hamr-tool-proxy · **Base:** origin/main · **Parent:** Epic #3008
**Files:** scripts/hamr-tool-policy.js (loader fix + DEFAULT_POLICY), scripts/hamr-tool-policy.spec.js,
scripts/hamr-tool-proxy.spec.js, scripts/hamr-tool-audit.spec.js, scripts/hamr-tool-policy.spec.md,
inventory/harness-self-test-registry.json (+3), .github/workflows/hamr-tool-policy.yml.

## Result
- node --check clean (all js). Registry JSON valid.
- Specs: **16/16 pass** — hamr-tool-policy 8/8, hamr-tool-proxy 4/4, hamr-tool-audit 4/4. Hermetic
  (Node built-ins only; no gh/network; tmp logs).
- Live defect fixed: `loadPolicy()` no longer throws on the absent external config — falls back to the
  least-privilege `DEFAULT_POLICY` (proved by the absent/malformed/roles-less tests). A valid external
  override still wins.
- Least-privilege proved: `github_self_comment` allowed only for collaborator/consultant; denied
  (stage `role`) for manager/admin. All role grants are a strict subset of the #2847 catalog.
- AC4: workflowCompliance ≥ 0.99 for offload roles (collaborator/consultant = 1.0).
- Audited envelope: proxy emits policy+execute rows on allow, one deny row on block (broker never
  invoked); audit stamps ts + preserves decision fields.
- validator-discipline OK (modified validator ships sibling spec + registry entry).
- enforcement-wiring-audit: hamr-tool-policy / hamr-tool-proxy / hamr-tool-audit all **ENFORCED** (new
  workflow root → spec → require chain).
- Content-only changeset (only ticket-3013 files + the shared registry line).
- Cross-family consensus **PASS** — receipt `9796ff0577d1964f` (meta[groq] + mistral, both PASS; $0 free-cloud).

## AC status (maps to #3013)
- AC1 [x] allow-list + deny-list enforcement (default-deny catalog + working least-privilege role layer).
- AC2 [x] least-privilege scopes mapped to manager/collaborator/admin/consultant.
- AC3 [x] audited invocation logs with policy-decision reason fields (proxy e2e + audit spec).
- AC4 [x] offload workflow classes executable with compliance >99% for offload roles.
- AC5 [x] sibling specs + registry entries + CI enforced root; validator-discipline OK.
- AC6 [x] free ≥2-family cross-model consensus PASS — 9796ff0577d1964f.

## Drift/scope note
Completes the #3013 code that shipped via the #3818 L6 baseline capture (PR#45) without its config,
tests, or registry wiring. No change to the #2847 fleet-mcp-tools catalog, ALLOWED_PERMS, or the
client-decided read + single-self-comment UAT boundary — least-privilege ROLE layer only (hardening).
