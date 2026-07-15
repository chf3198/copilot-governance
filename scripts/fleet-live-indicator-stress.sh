#!/usr/bin/env bash
set -euo pipefail

model="${MODEL:-tinyllama:latest}"
host="${HOST:-http://127.0.0.1:11434}"
prompt="${PROMPT:-terminal-uat-ping}"
keep_alive="${KEEP_ALIVE:-30m}"
interval="${INTERVAL:-1}"
duration="${DURATION:-60}"
node_label="${NODE_LABEL:-$(hostname)}"

for arg in "$@"; do
  case "$arg" in
    --model=*) model="${arg#*=}" ;;
    --host=*) host="${arg#*=}" ;;
    --prompt=*) prompt="${arg#*=}" ;;
    --keep-alive=*) keep_alive="${arg#*=}" ;;
    --interval=*) interval="${arg#*=}" ;;
    --duration=*) duration="${arg#*=}" ;;
    --node=*) node_label="${arg#*=}" ;;
  esac
done

end_epoch=$(( $(date +%s) + duration ))
ok=0
fail=0

echo "# Stress start node=${node_label} model=${model} duration=${duration}s interval=${interval}s"
while (( $(date +%s) < end_epoch )); do
  ts="$(date +%H:%M:%S)"
  payload=$(printf '{"model":"%s","prompt":"%s","stream":false,"keep_alive":"%s"}' "$model" "$prompt" "$keep_alive")
  if curl -sS --max-time 20 -H 'content-type: application/json' \
    -d "$payload" "${host%/}/api/generate" >/dev/null; then
    ok=$((ok + 1))
    echo "[$ts] node=${node_label} stress=ok req=${ok} fail=${fail}"
  else
    fail=$((fail + 1))
    echo "[$ts] node=${node_label} stress=fail req=${ok} fail=${fail}"
  fi
  sleep "$interval"
done

echo "# Stress done node=${node_label} ok=${ok} fail=${fail}"
if (( fail > 0 )); then
  exit 2
fi
