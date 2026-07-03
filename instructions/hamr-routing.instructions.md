---
name: HAMR Routing
description: Use the HAMR Worker (cost levers, signed observability, MCP capability dispatch) for every governed provider call across all 3 teams.
type: instructions
---

# HAMR Routing (Wave 1-6 production)

HAMR (`https://hamr.chf3198.workers.dev`) is the cross-team cost+observability layer.
Each team — Claude Code, Copilot, Codex — is a first-class consumer and is
expected to route governed provider calls through it.
Activate with `npm run hamr:activate` once per checkout. The activation script
supports normal clones and linked Git worktrees; it installs hooks through
Git's resolved hooks path rather than assuming `.git/` is a directory.
SessionStart runs `hamr_activation_check.py` as an advisory gate. Missing,
disabled, malformed, or >24h stale activation emits context before governed
provider calls; offline work remains unblocked.

## Producer chain (must run periodically)

| Producer (local)           | Pushes to                         | Consumed by                 |
|----------------------------|-----------------------------------|-----------------------------|
| `npm run hamr:cache-push`  | KV `cache-stats:hit-rate-7d`      | `/quota` `hit_rate_7d`      |
| `npm run hamr:health-push` | KV `substrate-health:latest`      | `/mcp doctor:probe`         |
| `npm run hamr:cache-emit`  | `~/.megingjord/cache-stats.jsonl` | `cache-hit-gate.runGate()`  |

A 6h cron is installed by `npm run hamr:install-cron`. Operators MAY skip when
their machine is offline; the Worker scheduled handler advertises staleness via
`/quota.stale=true`.

## Provider call contract (all 3 teams)

Every governed provider call SHOULD flow through `scripts/global/hamr-provider-wrapper.js`:

```js
const { wrapProviderCall } = require('./hamr-provider-wrapper');
const result = await wrapProviderCall('anthropic', () => sdk.messages.create(req), { tier });
```

The wrapper auto-applies `cacheHeaders(provider)` (#926), records `appendCacheStat`
on response (#932), and returns spillover hint via `maybeSpillover` (#927) on rate-limit.
Treat runtime and provider as separate fields: Codex is a runtime, while
OpenAI-compatible, Anthropic, Ollama, LiteLLM, or OpenRouter are provider paths.

## Diagnostic carve-out (per #1155)

For diagnostic calls, integration test probes, or health checks that must be excluded from production utilization and cost metrics:
- Pass `opts.tier = 'diagnostic'` to `wrapProviderCall`. This ensures the call bypasses provider stickiness/routing, executes directly, and is tagged as `tier: 'diagnostic'` in `cache-stats.jsonl` to exclude it from production metrics.
- For genuinely uncoverable raw connection bypasses (very rare), prefix the bypass with:
  ```js
  // hamr-bypass-ok: diagnostic <reason>
  ```
  This prevents linter alerts and reserves bypass status exclusively for necessary testing.

## Token telemetry policy

- Prefer exact provider usage from HAMR-wrapped responses or aggregate usage APIs.
- Record generic OpenAI-compatible traffic as `provider=openai-compatible` unless a
  narrower adapter is known.
- Do not invent Codex per-request token totals. If a Codex session does not expose
  per-request usage, record route metadata and reconcile against aggregate OpenAI
  usage or Codex OpenTelemetry exports when configured.

## /mcp capability dispatch

POST to `/mcp` with Ed25519 DPoP auth (use `baton-signing.js` #894) and body
`{capability, params}`. Capabilities: `bundle:fetch`, `doctor:probe`, `mailbox:read`,
`rotation:check`, `review:run`, `tool:governance-bundle`.
Bundle SHA may be advertised via `x-hamr-bundle-sha` for SLSA gate verification.

### tool:governance-bundle — fleet-consultant parity (#2094, Option C bundle-first)
Fleet models cannot reach the orchestrator's local consultant tools, so the
orchestrator precomputes a redacted, content-hashed **governance bundle** (via
`scripts/global/governance-bundle.js`) of the fields a Consultant CLOSEOUT
requires (`checks_run`, `checks_failed`, `drift_score`, `fleet_utilization`,
`rubric_rating`, `wiki_health`) and pushes it to KV at `governance-bundle:<issue>`.
`POST /mcp {capability:"tool:governance-bundle", params:{issue:N}}` returns it.

**Producer (#2613):** `npm run hamr:governance-bundle-push -- --issue N` (=`scripts/global/governance-bundle-push.js`) reads the per-issue fields snapshot at `~/.megingjord/governance-fields-<issue>.json`, builds + Ed25519-signs the bundle, and POSTs it to the HAMR `/governance-bundle` write route (DPoP + signed, mirrors `/substrate-health`), which stores `governance-bundle:<issue>` in KV. Run it before dispatching a fleet consultant for that issue.

**Freshness contract:** the bundle carries `generated_at` + `content_hash`.
A fleet-authored CLOSEOUT cites `governance-bundle-hash: <hash>`; `closeout-schema`
parity (`governance-bundle.js#fleetCloseoutParity`) requires the hash to match a
hash-valid bundle that is within `GOVERNANCE_BUNDLE_FAST_TTL_MS` (default 300s)
for the fast/volatile fields — **stale fast fields BLOCK** (not advisory); slow
fields (wiki/fleet inventory) are `STALE:`-advisory only. Privacy (G4): only the
positive field allow-list is emitted, after `log-redaction`; no raw diffs/tokens.

## Cost levers (covered here, do NOT redefine in team docs)

- Cache adapters per provider — see `wiki/wisdom/global/concepts/cache-adapters.md` (#926).
- Header-driven spillover across 6 providers — `wiki/wisdom/global/concepts/header-spillover.md` (#927).
- Sticky-route per tier — `scripts/global/sticky-route.js` (#926).
- Anthropic Batch routing for time-elastic work (`isBatchEligible`, #927).

## Local `.env` auto-hydration (#2645 — promoted from operator-memory)

Provider keys live in the gitignored repo-root `.env`, but scripts read `process.env`, so a fresh
session that never ran `set -a; . ./.env; set +a` sees **zero keys** and wrongly concludes "no review
substrate" — defeating G3 (the fleet + free-cloud zero-cost lanes become unreachable). The dispatch
scripts (`free-cloud-dispatch.js`, `cascade-dispatch.js`, `hamr-provider-wrapper.js`) therefore call
the shared shim `scripts/global/load-local-env.js#loadLocalEnvOnce()` to hydrate `.env` automatically:

- **Fill-don't-override** — an already-set `process.env` var (CI secret, explicit export) always wins.
- **Secret-safe (G4)** — never logs values; the single audit line lists NAMES only, routed through
  `log-redaction.js`. Disable with `MEGINGJORD_NO_DOTENV=1`; relocate via `MEGINGJORD_DOTENV_PATH`.
- **Graceful (G5/G6)** — a missing or malformed `.env` is a no-op pass-through, never a throw.

Do NOT hand-curl Ollama or ask the client to restate a key already present in the approved local
`.env`; the shim makes it visible. Scope boundary: global cross-entrypoint hydration + secret-storage
strategy is owned by Epic #2291 (this is the dispatch-local slice).

## Boundaries

- HAMR scripts live in `scripts/global/` only. Do NOT duplicate logic in team-specific paths.
- The global task router (`global-task-router.instructions.md`) chooses the **lane** (Free/Fleet/Haiku/Premium); HAMR provides the **cost/observability mechanics** within each lane. No conflict.
- Copilot Team owns `dashboard/js/token-reconcile.js`, `cost-report.js`, `model-routing-engine.js`. HAMR wrapper does NOT modify those — wrapper produces JSONL + KV signals those files can read.

## Activation gates (before claiming HAMR-active)

Run on each checkout:

```bash
npm run hamr:activate         # installs git hooks + cron
npm run hamr:sync-verify      # confirms scripts present in ~/.copilot/, ~/.codex/
npx playwright test tests/hamr-team-integration.spec.js   # smoke test
```

Provider key checks are runtime-aware. `HAMR_TEAM=claude-code` defaults to the
Anthropic provider path and checks `ANTHROPIC_API_KEY`; `HAMR_TEAM=codex`
defaults to OpenAI-compatible activation and checks `OPENAI_API_KEY`.
Provider-neutral, fleet, and Ollama activation modes do not require a cloud
provider key at activation time. Set `HAMR_PROVIDER` to override the default.

## Per-role lane preferences (Refs #2320)

`model-routing-policy.json` now carries a `per_role_lane_preferences` block that
encodes a preferred lane (free|fleet|haiku|premium) per role × complexity tier
(low `[0,0.3)` / mid `[0.3,0.7)` / high `[0.7,1.0]`).

When `resolveRouting(prompt, route, { role })` is called with an active baton role,
the per-role preference overrides the base cascade lane — subject to rollback and
budget governors. The preference is skipped when a rollback is in effect.

Supported roles: `manager`, `collaborator`, `admin`, `consultant`, `it`, `red-team`.

Usage from any runtime:

```js
const { resolveRouting } = require('./model-routing-engine');
const resolved = resolveRouting(prompt, route, { role: 'collaborator' });
// resolved.rolePrefApplied === true when preference was applied
// resolved.activeRole === 'collaborator'
```

Design intent per D3 (fleet-first for role-execution):
- `collaborator`, `admin`, `it`: fleet at low+mid complexity; haiku only at high.
- `manager`, `consultant`: haiku at mid; premium at high (scoping/critique require reasoning).
- `red-team`: fleet at low+mid; haiku ceiling even at high (cross-family, not cloud-first).

## Override

Repos that explicitly opt out (e.g., air-gapped) MUST set `MEGINGJORD_HAMR_DISABLED=1`.
Non-set defaults to opt-in for governed work.

## Measurement & Drift Detection (Refs #2351)

Fleet-fallback events and IT-ops bypass usage are measured automatically to
detect aspirational-vs-actual drift. Two JSONL surfaces and two aggregator
scripts provide per-role-per-week and per-marker-per-week counters.

### Fleet-fallback telemetry

When `resolveRouting` falls back to `policy.models.fallback` (intended lane
model missing), it emits one event to `~/.megingjord/routing-fallback.jsonl`:

```json
{"ts":"...","role":"collaborator","lane_intended":"fleet","lane_actual":"fallback",
 "fallback_reason":"lane_model_missing","prompt_hash":"abc123def456"}
```

Run the aggregator report:

```bash
npm run routing:fallback-report
```

Tier-2 anneal is emitted to `~/.megingjord/incidents.jsonl` when any role's
fallback count exceeds 25% of total fallback events in a week. Override
threshold with env var `ROUTING_FALLBACK_THRESHOLD=0.10` (fractional, default 0.25).

### IT-bypass usage telemetry

When `pretool_guard.py` detects an IT-ops bypass marker on a commit, it emits
one event to `~/.megingjord/it-bypass-usage.jsonl`:

```json
{"ts":"...","marker":"env:MEGINGJORD_IT_OPS=1","commit_sha":"abc1234",
 "justification":"chore(it-ops): restart dashboard pid"}
```

Run the aggregator report:

```bash
npm run it-ops:usage-report
```

Tier-2 anneal is emitted when any marker's usage exceeds 5 events per week.
Override threshold with env var `IT_BYPASS_THRESHOLD=10` (integer, default 5).

### Free-cloud usage telemetry (#2624)

When the fleet is unreachable and `cascade-dispatch` executes a free $0 cloud
provider (#2621), it records a `lane:free-cloud` row to
`logs/model-routing-telemetry.jsonl`. The aggregator surfaces the G3 savings —
execution count (= paid-Haiku calls avoided), per-provider breakdown, average
latency, and an estimated paid-$ avoided — so the failover is auditable against
the premium-share governor:

```bash
npm run routing:free-cloud-report          # last 7 days, human-readable
npm run routing:free-cloud-report -- --days 30 --json
```

No anneal threshold: high free-cloud usage is a G3 win, not a fault. The $-avoided
estimate uses `policy.models.haiku.costPer1kTokens` and a documented assumed
~1500 tokens/call (see `scripts/global/free-cloud-usage-report.js`).
