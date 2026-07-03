---
title: "GitHub-Native Layer-2 Coordination"
type: concept
created: 2026-06-08
updated: 2026-06-08
tags: [layer-2, github-native, hamr, mailbox, bundle, telemetry, g3, zero-cost]
related: ["[[mailbox]]", "[[hamr-failover-map]]", "[[hamr-core-worker]]"]
status: active
wiki_type: wisdom
scope: global
content_trust_score: 0.95
freshness_window: 30d
last_updated: 2026-06-08
content_hash: placeholder
---

# GitHub-Native Layer-2 Coordination

Tier-1 coordination routes implemented as pure GitHub API primitives.
Zero Cloudflare, zero paid infrastructure. Ships in Epic #2488.

## Why it exists

HAMR (Cloudflare Worker) is the accelerated Tier-2 path for cross-agent
coordination. GitHub-native is the **default Tier-1 path**: functional for
all standard use cases, costs nothing beyond the GitHub repo itself.

## Route table

| Coordination need | Script | GitHub primitive |
|---|---|---|
| Mailbox write/read | `github-mailbox.js` | Issues comment + ETag poll |
| Bundle publish/fetch | `github-bundle-client.js` | Releases assets API |
| Async task dispatch | `github-mcp-dispatch.js` | `repository_dispatch` |
| Quota / cache telemetry | `github-telemetry-read.js` | Actions artifact |
| Substrate health | `github-substrate-health-read.js` | Actions artifact |
| Nightly review | `review-run.yml` | Scheduled Action (02:00 UTC) |
| Rotation check | `rotation-check.yml` | Weekly Action (Mon 09:00 UTC) |

## Unified client

`scripts/global/github-native-client.js` wraps all routes. Selects backend
via `MEGINGJORD_HAMR_ENABLED` env var:

- `0` / unset → GitHub-native (default)
- `1` → HAMR Cloudflare Worker

## G3 impact

Removes the Cloudflare Worker hard dependency for new operators. Tier-1
install = `git clone` + `npm run deploy:apply`. No HAMR account needed.

## See also

- `docs/howto/github-native-layer2.md` — operator install guide
- [[mailbox]] — HAMR R2 mailbox (Tier-2 path)
- [[hamr-failover-map]] — failover routing table
