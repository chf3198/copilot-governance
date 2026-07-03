#!/bin/bash
# Pre-commit hook — validate branch name convention
# Pattern: feat/<N>-*, fix/<N>-*, skill/<name>, chore/<desc>, or main
# Install: cp hooks/scripts/validate-branch-name.sh .git/hooks/pre-commit

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
if [ -z "$BRANCH" ]; then exit 0; fi

if echo "$BRANCH" | grep -qE "^sandbox/"; then
  echo "❌ Commits on sandbox launcher branches are blocked: '$BRANCH'"
  echo "   Create a task branch first (feat/<ticket#>-<desc>, fix/<ticket#>-<desc>)."
  echo "   Tip: bash scripts/worktree-session-start.sh <copilot|codex|claude-code> feat/<ticket#>-<desc>"
  exit 1
fi

# Allowed type prefixes -- canonical 11-type set defined in #2304.
# Source of truth: scripts/global/conventional-commits-enum.js
# CI sync guard: tests/conventional-commits-enum.spec.js asserts this
# literal matches the JS module's CONVENTIONAL_COMMIT_TYPES array.
VALID="^(feat|fix|chore|content|perf|refactor|docs|style|test|skill|hotfix)/[a-z0-9][-a-z0-9]*$|^main$|^develop$"

if ! echo "$BRANCH" | grep -qE "$VALID"; then
  echo "❌ Branch name '$BRANCH' violates naming convention."
  echo "   Required: feat/<ticket#>-<desc>, fix/<ticket#>-<desc>,"
  echo "             skill/<name>, chore/<desc>, or main"
  echo "   Examples: feat/86-wiki-ingest, fix/42-typo, skill/new-thing"
  exit 1
fi

# If feat/ or fix/, require a ticket number prefix
if echo "$BRANCH" | grep -qE "^(feat|fix|hotfix)/"; then
  if ! echo "$BRANCH" | grep -qE "^(feat|fix|hotfix)/[0-9]+-"; then
    echo "❌ Branch '$BRANCH' must include ticket number."
    echo "   Pattern: feat/<ticket#>-<description>"
    echo "   Example: feat/86-wiki-ingest"
    exit 1
  fi
fi

exit 0
