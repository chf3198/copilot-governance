#!/bin/bash
# Optional pre-commit hook — run detect-secrets against staged files.
# Install: cp hooks/scripts/detect-secrets-precommit.sh .git/hooks/pre-commit
# Requires: pip install --user detect-secrets==1.5.0
DETECT="${HOME}/.local/bin/detect-secrets"
if [ ! -x "$DETECT" ]; then
  echo "⚠️  detect-secrets not installed — skipping (install: pip install --user detect-secrets)" >&2
  exit 0
fi
if [ ! -f .secrets.baseline ]; then
  echo "⚠️  .secrets.baseline missing — skipping" >&2
  exit 0
fi
STAGED=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$STAGED" ] && exit 0
# scan staged files only (faster than full repo)
echo "$STAGED" | xargs $DETECT scan --baseline .secrets.baseline 2>&1 || {
  echo "❌ detect-secrets found new secrets. Audit baseline before committing." >&2
  exit 1
}
exit 0
