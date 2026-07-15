# governance-evidence-bridge — spec (#3014 · Epic #3008 Phase C)

Auto-bridges baton artifacts (Manager/Collaborator/Admin/Consultant handoffs) into a
`governance-fields/v2` snapshot for HAMR bundles, then **verifies** that snapshot — so fleet-offloaded
work carries the same governance evidence as an in-harness run (a G3 enabler: it lets $0 fleet work
prove parity instead of escalating to paid re-review). Completed here from the #3818 L6 capture, which
shipped only the bridging half (AC1) with no parity/TTL/completeness/diagnostics and no tests.

## API
- `bridgeFromComments(issue, comments, nowMs?) → snapshot` — extract per-role `ROLE_FIELD_KEYS` from the
  last-of-each-type baton artifacts into `{schema, issue, roles, fields, generated_at, content_hash}` (AC1).
- `computeContentHash(snapshot)` — canonical sha256 over `{issue, fields, generated_at}` (the derivation
  bridging stamps).
- `verifyParity(snapshot) → {ok, expected, actual}` — recompute + compare; detects post-hoc edits (AC2).
- `isStale(snapshot, {ttlMs?, nowMs?}) → bool` — older than the freshness window (default 24h);
  unparseable `generated_at` ⇒ stale (fail-safe) (AC2).
- `evaluateCompleteness(snapshot, {requiredRoles?}) → {complete, roles:{role:{required, present, missing}}}` —
  per-role gate coverage; `requiredRoles` gates a staged issue against roles that MUST have reported (AC3).
- `diagnose(snapshot, opts) → {ok, findings:[{code, severity, role?, field?, message, remediation}]}` —
  `EB_PARITY` (high), `EB_STALE` (medium), `EB_MISSING_FIELD` (medium), each with remediation text (AC4).
- `--verify <snapshot.json> [--roles a,b,c]` CLI — prints the diagnosis; advisory, exits 0; hermetic.

## Invariants (proved by governance-evidence-bridge.spec.js)
1. Bridging maps each role's declared fields into the snapshot; a well-formed snapshot has a 64-hex hash.
2. Parity holds on a clean snapshot and FAILS on any tampered field/timestamp.
3. Freshness: within TTL ⇒ fresh; beyond TTL or unparseable ts ⇒ stale.
4. Completeness: a fully-reported gate is `complete`; a missing field / absent required role is flagged.
5. Diagnostics: clean+fresh+complete ⇒ `ok:[]`; otherwise actionable findings with remediation.

## Dependency note
The bridge's only load-time dependency is `baton-artifact-governance` (`entries`/`classifyComment`).
That module required the out-of-repo `megalint/signer-registry-check`, which is absent on this checkout —
a latent breakage that made the bridge (and every other consumer) unloadable. #3014 hardens that require
with a graceful `MODULE_NOT_FOUND` fallback (finders keep working; signer/alias validation degrades to a
safe no-op until megalint is restored), covered by `baton-artifact-governance.spec.js`.

## Enforced root
`.github/workflows/governance-evidence-bridge.yml` runs both specs as a hard gate, making the two
scripts ENFORCED (enforcement-wiring-audit) with sibling specs + registry entries (validator-discipline
#1893). Pure/hermetic — Node built-ins only.
