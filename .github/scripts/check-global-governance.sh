#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

required_files=(
  ".github/instructions/global-skills.instructions.md"
  ".github/instructions/skill-routing.instructions.md"
  ".github/instructions/openclaw-universal.instructions.md"
  ".github/scripts/check-global-governance.sh"
  ".github/workflows/global-governance-presence.yml"
)

required_hook_files=(
  ".githooks/pre-commit"
  ".githooks/pre-push"
)

missing=0

echo "Global governance presence check"
for f in "${required_files[@]}"; do
  if [[ -f "$ROOT/$f" ]]; then
    echo "  ✓ $f"
  else
    echo "  ✗ $f"
    missing=1
  fi
done

for h in "${required_hook_files[@]}"; do
  if [[ -f "$ROOT/$h" ]]; then
    echo "  ✓ $h"
  else
    echo "  ✗ $h"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "Global governance presence check FAILED"
  exit 1
fi

echo "Global governance presence check PASSED"
