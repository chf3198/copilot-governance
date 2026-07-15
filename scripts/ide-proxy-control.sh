#!/usr/bin/env bash
# ide-proxy-control.sh — Phase 2 D4 (#1034).
# Start/stop/status for LiteLLM-backed IDE proxy. PID file + log.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
config_file="$repo_root/config/litellm-config.yaml"
pid_file="${HOME}/.megingjord/ide-proxy.pid"
log_file="${HOME}/.megingjord/ide-proxy.log"
host="${IDE_PROXY_HOST:-127.0.0.1}"
port="${IDE_PROXY_PORT:-11437}"

mkdir -p "$(dirname "$pid_file")"

cmd=${1:-status}

case "$cmd" in
  start)
    if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      echo "✅ already running (pid=$(cat "$pid_file"))"
      exit 0
    fi
    if ! command -v litellm >/dev/null; then
      echo "❌ litellm not installed. Install: pip install 'litellm[proxy]'"
      exit 1
    fi
    if [ "${MEGINGJORD_HAMR_DISABLED:-0}" = "1" ]; then
      echo "⚠ MEGINGJORD_HAMR_DISABLED=1 — proxy start refused (opt-out active)"
      exit 0
    fi
    nohup litellm --config "$config_file" --host "$host" --port "$port" \
      >> "$log_file" 2>&1 &
    echo $! > "$pid_file"
    sleep 1
    if kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      echo "✅ started (pid=$(cat "$pid_file")) on http://$host:$port"
      echo "   point Claude Code IDE api_endpoint at http://$host:$port/v1/messages"
    else
      echo "❌ start failed; check $log_file"
      rm -f "$pid_file"
      exit 1
    fi
    ;;
  stop)
    if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      kill "$(cat "$pid_file")"
      rm -f "$pid_file"
      echo "✅ stopped"
    else
      echo "⏭ not running"
      rm -f "$pid_file"
    fi
    ;;
  status)
    if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      echo "✅ running (pid=$(cat "$pid_file")) on http://$host:$port"
    else
      echo "⏸ not running"
    fi
    ;;
  *)
    echo "usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
