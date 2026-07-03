#!/usr/bin/env bash
# install-cron.sh — HAMR Wave 7 child C (#953).
# Idempotently adds a 6h crontab entry that runs hamr-periodic-push.sh.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
push_script="$repo_root/scripts/global/hamr-periodic-push.sh"
marker="# megingjord-hamr-periodic-push (#953)"

if [ ! -x "$push_script" ]; then
  chmod +x "$push_script"
fi

# Read existing crontab; tolerate "no crontab for user" exit 1 by treating empty.
existing=$(crontab -l 2>/dev/null || true)

if printf '%s\n' "$existing" | grep -q "$marker"; then
  echo "✅ cron entry already installed (marker: $marker)"
  exit 0
fi

new_entry="0 */6 * * * MEGINGJORD_REPO_ROOT=$repo_root bash $push_script $marker"
{ printf '%s\n' "$existing"; printf '%s\n' "$new_entry"; } | crontab -
echo "✅ installed cron entry — runs hamr-periodic-push every 6h"
echo "   inspect:  crontab -l | grep hamr-periodic-push"
echo "   remove:   crontab -l | grep -v hamr-periodic-push | crontab -"
