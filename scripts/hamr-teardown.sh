#!/usr/bin/env bash
# hamr-teardown.sh — paired tear-down for hamr-deploy.sh per v3.2.1 §R9.4.
# Idempotent + HTTP-404 verification post-condition.
# Usage: bash scripts/global/hamr-teardown.sh [--worker-name <name>] [--keep-r2] [--keep-kv]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKER_NAME="hamr"
KEEP_R2=0
KEEP_KV=0
while [ $# -gt 0 ]; do
  case "$1" in
    --worker-name) WORKER_NAME="$2"; shift 2 ;;
    --keep-r2) KEEP_R2=1; shift ;;
    --keep-kv) KEEP_KV=1; shift ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  if [ -f "$ROOT/.env" ]; then
    CLOUDFLARE_API_TOKEN="$(grep '^CLOUDFLARE_API_TOKEN=' "$ROOT/.env" | cut -d= -f2-)"
    export CLOUDFLARE_API_TOKEN
  else
    echo "❌ CLOUDFLARE_API_TOKEN not set." >&2; exit 3
  fi
fi

cd "$ROOT/cloudflare/hamr"
WRANGLER="$ROOT/node_modules/.bin/wrangler"
WORKER_URL="https://${WORKER_NAME}.chf3198.workers.dev"

echo "🧨 Tearing down HAMR Worker ($WORKER_NAME)..."
"$WRANGLER" delete --name "$WORKER_NAME" --force 2>&1 | tail -3 || true

if [ "$KEEP_R2" -eq 0 ]; then
  echo "🪣 Removing R2 bucket hamr-bundles (objects + bucket)..."
  "$WRANGLER" r2 bucket delete hamr-bundles 2>&1 | tail -3 || true
fi

if [ "$KEEP_KV" -eq 0 ]; then
  KV_ID="$(grep -E '^id = "' wrangler.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')"
  if [ -n "$KV_ID" ]; then
    echo "🗝  Removing KV namespace $KV_ID..."
    "$WRANGLER" kv namespace delete --namespace-id "$KV_ID" 2>&1 | tail -3 || true
  fi
fi

# R9.4 post-condition: /healthz returns HTTP 404.
echo "🔬 R9.4 tear-down verification: probing $WORKER_URL/healthz ..."
ATTEMPTS=0
until [ "$(curl -s -o /dev/null -w '%{http_code}' "$WORKER_URL/healthz")" = "404" ] || [ "$ATTEMPTS" -ge 15 ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 2
done
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "$WORKER_URL/healthz")"
if [ "$HTTP_CODE" != "404" ]; then
  echo "❌ R9.4 tear-down FAILED: /healthz returned $HTTP_CODE (expected 404)" >&2
  exit 4
fi
echo "✅ R9.4 tear-down met: /healthz HTTP 404"
echo "::HAMR_TEARDOWN_OK url=$WORKER_URL worker=$WORKER_NAME"
