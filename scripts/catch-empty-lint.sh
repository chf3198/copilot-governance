#!/usr/bin/env bash
# catch-empty-lint.sh — detect unsuppressed empty-body catches in workflow files
# Ref: #2090. Covers single-line, named-param, and multiline forms.
set -euo pipefail

DIR="${1:-.github/workflows}"
SUPPRESS='// catch-empty:'

# Matches single-line: .catch(() => {}), .catch((e) => {}), .catch((_) => {})
SINGLE='\.catch\(\s*\(?[a-z_]*\)?\s*=>\s*\{\s*\}\)'

# Matches multiline opening: .catch(... => {  (end of line)
MULTI='\.catch\(\s*\(?[a-z_]*\)?\s*=>\s*\{\s*$'

found=0

# Single-line detection (exclude YAML comment lines)
while IFS= read -r hit; do
  echo "  $hit"; found=1
done < <(grep -rEn "$SINGLE" "$DIR" | grep -v "$SUPPRESS" | grep -v '^\S*:[0-9]*:\s*#' || true)

# Multiline detection: opening line followed by }) on the very next line
while IFS=: read -r file lineno rest; do
  if printf '%s' "$rest" | grep -qE '^\s*#'; then continue; fi
  nextline=$(sed -n "$((lineno+1))p" "$file")
  if printf '%s' "$nextline" | grep -qE '^\s*\}\)'; then
    echo "  $file:$lineno: $rest [multiline empty catch]"; found=1
  fi
done < <(grep -rEn "$MULTI" "$DIR" | grep -v "$SUPPRESS" || true)

if [ "$found" -eq 1 ]; then
  echo ""
  echo "ERROR: unsuppressed empty catch block(s) found above."
  echo "Replace with error handling, or add '// catch-empty: <reason>' on the catch line."
  exit 1
fi
echo "OK: no unsuppressed empty catches found."
