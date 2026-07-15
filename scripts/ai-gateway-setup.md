# AI Gateway Setup (Anthropic Cache)

## Purpose
Create an opt-in Cloudflare AI Gateway cache in front of Anthropic with zero default behavior change.

## Prerequisites
- Cloudflare account (free tier is fine)
- Anthropic API key in local `.env`
- `ANTHROPIC_BASE_URL` **unset** by default

## Create Gateway
1. Open Cloudflare dashboard → AI → AI Gateway.
2. Create gateway name: `megingjord-anthropic-cache`.
3. Provider route: `anthropic`.
4. Enable caching and set default TTL to 24h.
5. Enable request/rate-limit logging.

## Local Env (Opt-in)
Add to `.env` only when testing through gateway:

```dotenv
CLOUDFLARE_AI_GATEWAY_NAME=megingjord-anthropic-cache
ANTHROPIC_BASE_URL=https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/anthropic
```

If `ANTHROPIC_BASE_URL` is unset, calls continue to direct Anthropic endpoint.

## Smoke Validation
Run:

```bash
node scripts/global/anthropic-gateway-smoke.js
```

Expected:
- `base_url` equals gateway URL when configured.
- Response status is `200`.
- Run the same prompt twice; second response should show cache hit in Cloudflare dashboard analytics.

## Rollback
- Remove `ANTHROPIC_BASE_URL` from `.env`.
- Re-run smoke script to confirm direct endpoint.

## Notes
- No multi-account stacking.
- Keep gateway off by default to avoid surprise routing changes.
