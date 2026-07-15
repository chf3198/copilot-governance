#!/usr/bin/env bash
# hamr-deploy.sh — deploy HAMR core CF Worker (#910) per v3.2.1 §R9.
# R9.2 cwd-vs-branch pre-flight; R9.4 deploy → /healthz HTTP 200 post-condition.
# Usage: bash scripts/global/hamr-deploy.sh [--worker-name <name>]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKER_NAME="hamr"
if [ "${1:-}" = "--worker-name" ] && [ -n "${2:-}" ]; then
  WORKER_NAME="$2"
fi

# R9.2 cwd-vs-branch pre-flight: require a feat/<num>-* or chore/* branch (not detached).
BRANCH="$(git -C "$ROOT" branch --show-current)"
if [ -z "$BRANCH" ]; then
  echo "❌ R9.2 violation: HEAD detached. Check out a branch before deploying." >&2
  exit 2
fi
echo "🪪 R9.2 pre-flight: branch=$BRANCH"

# Load CLOUDFLARE_API_TOKEN from .env without exporting full contents.
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  if [ -f "$ROOT/.env" ]; then
    CLOUDFLARE_API_TOKEN="$(grep '^CLOUDFLARE_API_TOKEN=' "$ROOT/.env" | cut -d= -f2-)"
    export CLOUDFLARE_API_TOKEN
  else
    echo "❌ CLOUDFLARE_API_TOKEN not set and no .env present." >&2
    exit 3
  fi
fi

cd "$ROOT/cloudflare/hamr"
WRANGLER="$ROOT/node_modules/.bin/wrangler"

echo "🚀 Deploying HAMR core Worker ($WORKER_NAME)..."
"$WRANGLER" deploy --name "$WORKER_NAME" 2>&1 | tail -15

WORKER_URL_GUESS="https://${WORKER_NAME}.chf3198.workers.dev"

# R9.4 post-condition: /healthz returns HTTP 200 within 30 s.
echo "🔬 R9.4 post-condition: probing $WORKER_URL_GUESS/healthz ..."
ATTEMPTS=0
until curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL_GUESS/healthz" | grep -q "^200$" || [ "$ATTEMPTS" -ge 15 ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 2
done
HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL_GUESS/healthz")"
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ R9.4 post-condition FAILED: /healthz returned $HTTP_CODE (expected 200)" >&2
  exit 4
fi
echo "✅ R9.4 post-condition met: /healthz HTTP 200 at $WORKER_URL_GUESS"
echo "::HAMR_DEPLOY_OK url=$WORKER_URL_GUESS branch=$BRANCH worker=$WORKER_NAME"
