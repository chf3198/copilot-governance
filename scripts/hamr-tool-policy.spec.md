# hamr-tool-policy — spec (#3013 · Epic #3008 Phase B)

Role-scoped allow-list layered on the #2847 `fleet-mcp-tools` **default-deny** catalog, so HAMR can
proxy a bounded set of fleet-offloaded tool workflows without ever broadening the tool surface. This is
the G3 (zero-cost) mechanism: it lets governed review/analysis run on the free fleet under least
privilege. Completed here from the #3818 L6 capture, which shipped the code but not its config, tests,
or registry wiring — and left a live loader defect.

## API
- `loadPolicy(cfgPath?) → policy` — loads the external override at `../../config/hamr-tool-allowlist.json`
  when present **and valid** (has a `roles` map); otherwise returns the built-in least-privilege
  `DEFAULT_POLICY`. **Never throws** on an absent/unreadable/malformed/roles-less config (the defect the
  capture shipped: the old loader `JSON.parse(readFileSync(...))` crashed because the config is not
  shipped and the runtime path does not exist). Mirrors `authorization-profile.js`'s graceful default.
- `DEFAULT_POLICY` — `{ roles, workflows }`. Read tools (`github_read`, `wiki_search`, `repo_map`) for
  every offload role; the single `github_self_comment` WRITE only for `collaborator`/`consultant` (the
  roles that post fleet advisories); `manager`/`admin` read-only as a fleet identity. Every grant is a
  strict subset of the #2847 catalog.
- `evaluateToolPolicy(tool, args, ctx, cfgPath?) → {allowed, stage, ...}` — two-stage decision:
  `catalog` (the #2847 `authorizeToolCall` default-deny + arg validation) then `role` (role-scoped
  allow-list). `stage` records where a deny happened.
- `roleAllows(policy, role, tool) → bool`.
- `workflowCompliance(policy, role) → {role, compliant, total, rate}` — fraction of the governed offload
  workflow classes a role may execute (AC4).

## Invariants (proved by hamr-tool-policy.spec.js + hamr-tool-proxy.spec.js + hamr-tool-audit.spec.js)
1. **Default-deny first:** an unknown tool is denied at the `catalog` stage regardless of role.
2. **Least privilege:** `github_self_comment` is allowed only for `collaborator`/`consultant`; denied
   (stage `role`) for `manager`/`admin`. Role grants never include a non-catalog tool.
3. **No-throw fallback:** absent / unreadable / malformed / roles-less config ⇒ `DEFAULT_POLICY`.
4. **Override precedence:** a valid external config (with `roles`) wins; missing `workflows` fill from default.
5. **AC4:** `workflowCompliance` ≥ 0.99 for the offload roles (`collaborator`, `consultant`).
6. **Audited envelope:** the proxy emits a policy-decision audit row on allow (+ an execute row) and on
   deny (exactly one row, broker never invoked) — `hamr-tool-audit` stamps `ts` and preserves the
   `{tool, role, allowed, reason, stage}` decision fields.

## Enforced root
`.github/workflows/hamr-tool-policy.yml` runs all three specs as a hard gate, making
`scripts/hamr-tool-{policy,proxy,audit}.js` ENFORCED (enforcement-wiring-audit) with sibling specs +
registry entries (validator-discipline #1893). Pure/hermetic — Node built-ins only; no network, no gh.

## Not in scope
No change to the #2847 catalog, `ALLOWED_PERMS`, or the client-decided read + single-self-comment UAT
boundary. This ticket adds a least-privilege ROLE layer on top; it never widens the surface.
