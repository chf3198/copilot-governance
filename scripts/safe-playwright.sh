#!/bin/bash
# safe-playwright — invoke npx playwright with zombie-safe defaults.
# Per #2019: replaces `npx playwright test ... | tail -N` antipattern
# that triggers microsoft/playwright#27048 stdout-pipe hang.
# Captures output to a temp file, then reads — pipe-tail is the trigger.

set -euo pipefail

OUTPUT_FILE="${PLAYWRIGHT_OUTPUT_FILE:-/tmp/playwright-safe-out.txt}"
TAIL_LINES="${PLAYWRIGHT_TAIL_LINES:-20}"

# Required defaults to bound resource use:
#   --workers=1       — no fan-out (the original zombie multiplier)
#   --max-failures=5  — bail before runaway accumulation
#   --reporter=line   — single-line per test (cap output volume)
EXTRA_ARGS=("--workers=1" "--max-failures=5" "--reporter=line")

if ! command -v npx >/dev/null 2>&1; then
  echo "safe-playwright: npx not in PATH" >&2
  exit 127
fi

# Run; capture combined stdout+stderr to file. No pipe-to-tail.
set +e
npx playwright test "${EXTRA_ARGS[@]}" "$@" >"${OUTPUT_FILE}" 2>&1
EXIT_CODE=$?
set -e

echo "===== last ${TAIL_LINES} lines (full output at ${OUTPUT_FILE}) ====="
tail -n "${TAIL_LINES}" "${OUTPUT_FILE}"
exit "${EXIT_CODE}"
