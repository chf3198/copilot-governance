---
title: HAMR Substrate-Health Probe
type: concept
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, wave2, substrate-health, tier-classification, probe]
related: ["[[hamr-v3-2-2026-05-04]]", "[[hamr-v3-2-1-2026-05-05]]", "[[hamr-doctor]]", "[[hamr-core-worker]]", "[[capability-detection]]"]
status: draft
---

# HAMR Substrate-Health Probe

## Purpose

Runtime sensor that classifies HAMR's current operational tier
(tier1-full / tier2-degraded / tier3-offline) per v3.2 §R7 +
v3.2.1 §R9.3. Distinct from #896 `hamr:doctor` (which is the
operator-facing CLI surfacing capability + remediation):
substrate-health is the **machine-readable runtime state** that
HAMR's routing engine reads to make per-call decisions.

Output: `~/.megingjord/substrate-health.json` (operator-local;
gitignored).

## API

`scripts/global/substrate-health.js` (CommonJS):

| Function | Purpose |
|---|---|
| `probeSubstrateHealth(opts?)` | Build the probe object (no disk write). |
| `writeSubstrateHealth(opts?)` | Probe + write `~/.megingjord/substrate-health.json`. |
| `probeHamrWorker(workerUrl?)` | Probe the deployed HAMR core Worker `/healthz`. |
| `deriveTier(probe)` | Classify tier from probe object. |

CLI (extends #877 capability-probe.js): `npm run hamr:health` →
`node scripts/global/substrate-health.js [--json]`. Or
`node scripts/global/capability-probe.js --substrate-health`.

## Tier-derivation rules

```
hamr_worker.reachable == false               → tier3-offline (worker-unreachable)
hamr_worker.tier == 'tier3-offline'          → tier3-offline (worker-self-reported)
fleetUp == 0 && providersUp == 0             → tier3-offline (no-fleet-or-providers)
fullCount(worker tier1 + fleet ≥1 + providers ≥2 + judges ≥2) == 4
                                              → tier1-full
otherwise                                    → tier2-degraded
```

`fullCount` is a 4-component score: HAMR Worker self-reports
tier1-full, ≥1 fleet host reachable, ≥2 providers available, ≥2
judge families available. All four must be true for tier1-full.

## Schema

```json
{
  "schema_version": 1,
  "ts": <unix-ms>,
  "tier": "tier1-full" | "tier2-degraded" | "tier3-offline",
  "reason": "<human-readable>",
  "hamr_worker": { "reachable": bool, "tier"?: string, "elapsed_ms"?: number },
  "fleet": { "<host>": { "reachable": bool, "models"?: [...] } },
  "providers": { "<name>": { "available": bool } },
  "judges": { "qwen": { "available": bool, "provenance": string }, "llama": ..., "claude": ..., "gemini": ... }
}
```

## R9.3 timeout policy

Each individual probe times out at 3 s with fail-soft (wraps a
`Promise.race` against a deadline). Total probe runtime is
≤10 s under all conditions. Family-fallback is delegated to
`judge-quorum.js` (#895) for actual judge calls — substrate-
health only checks reachability based on the capability-probe
provider availability flags.

## Extends `capability-probe.js`

Per S1 #876 audit, this is a REFACTOR-extending of the existing
capability-probe.js, NOT a new parallel module. The new
`--substrate-health` flag invokes `substrate-health.js`'s
`writeSubstrateHealth()`. The existing capability-probe.js
behavior is unchanged when invoked without the flag.

## References

- HAMR v3.2 §R7: `research/hamr-v3-2-2026-05-04.md` (#890).
- v3.2.1 §R9.3: `research/hamr-v3-2-1-2026-05-05.md` (#907).
- HAMR core Worker `/healthz` (#910): `cloudflare/hamr/routes/healthz.ts`.
- Capability probe: `scripts/global/capability-probe.js` (#877).
- Implementation: this PR (#911).
