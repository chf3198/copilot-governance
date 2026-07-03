---
title: "Capability Detection"
type: concept
created: 2026-05-04
status: active
---
# Capability Detection

> Non-destructive substrate probes that populate `.dashboard/capabilities.json`.

## Overview

`scripts/global/capability-probe.js` runs read-only checks and writes a
manifest consumed by the dashboard and routing logic. Probes time out at
≤6 s, fail-soft to `{ available: false, reason: "..." }`, and never log
secrets or tokens.

## Schema — `.dashboard/capabilities.json` (schema_version 2)

```json
{
  "probed_at": "<ISO-8601>",
  "schema_version": 2,
  "tailscale": { "available": true },
  "fleet": {
    "<device-id>": { "reachable": true, "models": ["qwen2.5:7b"] }
  },
  "cloudflare": {
    "account": { "available": true },
    "reachability": { "reachable": true, "authenticated": true }
  },
  "r2": { "available": true },
  "wrangler": { "available": true, "version": "wrangler 4.x.x" },
  "github_oidc": {
    "eligible": true,
    "caveat": "heuristic-only"
  },
  "mcp": {
    "rag_server": { "reachable": false, "url": null },
    "client": { "available": true, "source": "node_modules" }
  },
  "npm_trusted_publishing": { "eligible": true },
  "providers": {
    "anthropic": { "available": true, "http_status": 200 },
    "openai":    { "available": false, "reason": "no-key" },
    "groq":      { "available": false, "reason": "no-key" },
    "cerebras":  { "available": false, "reason": "no-key" },
    "google_ai_studio": { "available": false, "reason": "no-key" },
    "openrouter": { "available": false, "reason": "no-key" }
  }
}
```

## HAMR Probes (S2 spike — #877)

| Probe | Module | Env vars needed | Notes |
|---|---|---|---|
| `probeCloudflare` | `hamr-probes.js` | `CLOUDFLARE_API_TOKEN` (optional) | Account list heuristic only |
| `probeR2` | `hamr-probes.js` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | Read-only list |
| `probeWrangler` | `hamr-probes.js` | — | Shell to `wrangler --version`; pass if ≥4.0.0 |
| `probeGithubOidc` | `hamr-probes.js` | `gh` CLI auth | Heuristic; org policy not inspected |
| `probeMcp` | `hamr-probes.js` | — | Scans `node_modules` + home config |
| `probeNpmTrustedPublishing` | `hamr-probes.js` | — | `npm whoami` + `publishConfig.provenance` |

## CLI

```bash
node scripts/global/capability-probe.js          # writes manifest, prints summary
node scripts/global/capability-probe.js --json   # prints manifest as JSON to stdout
npm run capability:show                           # pretty-print last manifest
```

## Secret safety

- Tokens are read from env; never printed, logged, or written to the manifest.
- `CLOUDFLARE_ACCOUNT_ID` is used only as a path component in an API URL (not echoed).
- `github_oidc` result omits repo name from the manifest.

## Related

- [[model-routing]] — routing uses `providers` field to pick cheapest available lane.
- [[fleet-architecture]] — `fleet` field reflects Ollama host reachability.
