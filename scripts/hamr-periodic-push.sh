#!/usr/bin/env bash
# hamr-periodic-push.sh — HAMR Wave 7 child C (#953).
# Runs both producer pushes; exits 0 if either succeeds; logs to ~/.megingjord/push-log.jsonl.
set -uo pipefail

repo_root=${MEGINGJORD_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}
log_file="${HOME}/.megingjord/push-log.jsonl"
mkdir -p "$(dirname "$log_file")"

run_push() {
  local label=$1
  local cmd=$2
  local ts; ts=$(date +%s%3N)
  local out exit_code
  out=$(cd "$repo_root" && eval "$cmd" 2>&1) ; exit_code=$?
  printf '{"ts":%s,"label":"%s","exit":%s,"head":"%s"}\n' \
    "$ts" "$label" "$exit_code" "$(echo "$out" | head -c 200 | tr '\n"' '  ')" >> "$log_file"
  return $exit_code
}

cache_status=1
health_status=1

if run_push cache-push "npm run --silent hamr:cache-push"; then
  cache_status=0
fi
if run_push health-push "npm run --silent hamr:health-push"; then
  health_status=0
fi

# Wave 8 child 1 (#976): also refresh the cascade-policy-overrides file.
run_push policy-overrides "npm run --silent hamr:policy-overrides" || true

# Graceful: succeed if either push went through (one missing snapshot is OK).
if [ "$cache_status" -eq 0 ] || [ "$health_status" -eq 0 ]; then
  echo "OK: cache=$cache_status health=$health_status (log: $log_file)"
  exit 0
fi
echo "WARN: both pushes failed — likely no local snapshots yet (log: $log_file)"
exit 0  # graceful: don't break operator cron
