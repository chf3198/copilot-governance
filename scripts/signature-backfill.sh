#!/usr/bin/env bash
# signature-backfill.sh — find and report PLACEHOLDER_SIGNATURE occurrences
# Usage: ./scripts/global/signature-backfill.sh [--fix SIG_BLOCK]
# Root cause: $SIG_BLOCK env var not inherited by Python subprocess (see #486)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PATTERN="PLACEHOLDER_SIGNATURE"
FIX_MODE=0
SIG_BLOCK=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fix) FIX_MODE=1; SIG_BLOCK="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "=== Signature Backfill Audit ==="
HITS=$(grep -rl "$PATTERN" "$ROOT/tickets" 2>/dev/null || true)
COUNT=$(echo "$HITS" | grep -c . || echo 0)
echo "Found $COUNT file(s) with $PATTERN"

if [[ -z "$HITS" ]]; then echo "No placeholders found. ✓"; exit 0; fi

echo "$HITS" | while read -r f; do echo "  - ${f#"$ROOT"/}"; done

if [[ $FIX_MODE -eq 1 && -n "$SIG_BLOCK" ]]; then
  echo ""
  echo "Replacing placeholders with provided SIG_BLOCK..."
  echo "$HITS" | while read -r f; do
    sed -i "s|$PATTERN|$SIG_BLOCK|g" "$f"
    echo "  fixed: ${f#"$ROOT"/}"
  done
  echo "Done. Verify with: node scripts/global/governance-verify.js"
else
  echo ""
  echo "Re-run with --fix '<sig>' to replace. Example:"
  printf '  SIG="Signed-by: Nova Mason\nTeam&Model: codex:gpt-5.3-codex@github-copilot\nRole: manager"\n'
  echo "  ./scripts/global/signature-backfill.sh --fix \"\$SIG\""
fi
