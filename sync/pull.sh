#!/usr/bin/env bash
# sync/pull.sh — pull canonical governance from main
# Invoked by the governance-pull systemd user timer every 15 minutes.
# Safe to run manually at any time.
set -euo pipefail

REPO_DIR="${GOVERNANCE_REPO:-$HOME/copilot-governance}"

cd "$REPO_DIR"

git fetch origin

# Always fast-forward only — we never commit directly to main locally.
# If this fails, it means main has diverged from the local branch (should not
# happen in normal operation). Log and surface the warning for manual triage.
if ! git merge --ff-only origin/main; then
  MSG="governance-pull: WARN: Cannot fast-forward ${REPO_DIR} from origin/main. Manual check needed."
  echo "$MSG" >&2
  command -v systemd-cat >/dev/null 2>&1 && \
    echo "$MSG" | systemd-cat -t governance-pull -p warning
  exit 1
fi

echo "governance-pull: synced from origin/main at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
