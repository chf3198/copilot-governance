---
title: "HAMR Failover Map"
type: concept
created: 2026-05-11
updated: 2026-06-08
tags: [hamr, resilience, github-native, layer-2, failover]
sources: []
related: ["[[3-tier-degraded-hamr]]", "[[hamr-bundle]]", "[[github-native-layer2]]"]
status: active
---

# HAMR Failover Map

Routing table: HAMR failure mode → GitHub-native fallback → degraded mode.

## Tier-1 (default): GitHub-native

All Layer-2 routes have GitHub-native implementations requiring no Cloudflare:

| Route | GitHub-native script | Trigger |
|---|---|---|
| `/mailbox/write`, `/mailbox/read` | `github-mailbox.js` | `MEGINGJORD_HAMR_ENABLED` unset |
| `/bundle/*` | `github-bundle-client.js` | `MEGINGJORD_HAMR_ENABLED` unset |
| `/mcp dispatch` | `github-mcp-dispatch.js` | `MEGINGJORD_HAMR_ENABLED` unset |
| `/quota`, `/cache-stats` | `github-telemetry-read.js` | Actions artifact polling |
| `/substrate-health` | `github-substrate-health-read.js` | Actions artifact polling |

## Tier-2 (opt-in): HAMR Cloudflare Worker

Set `MEGINGJORD_HAMR_ENABLED=1`. Provides DPoP signing, lower latency, KV-backed
replay protection. See [[hamr-core-worker]] for deployment.

## Failover decision: HAMR unreachable

`github-native-client.js` detects HAMR unavailability via HTTP error / timeout
and falls back to the corresponding Tier-1 script automatically (G6 resilience).

## See also

- [[github-native-layer2]] — full route table + dual-mode contract
- [[3-tier-degraded-hamr]] — deeper HAMR degradation tiers
- [[hamr-bundle]] — bundle route detail
