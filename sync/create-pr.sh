#!/usr/bin/env bash
# sync/create-pr.sh — open a GitHub PR for a self-annealed improvement
#
# Invoked by the AI after it has self-annealed a global-item.
# Creates a named feature branch, commits the change, pushes it, and
# opens a draft PR for user review.  The user approves (or edits and
# approves) the PR in GitHub; merging to main is the approval gate.
#
# Requirements: git, gh (GitHub CLI, authenticated with `gh auth login`)
#
# Usage:
#   sync/create-pr.sh \
#     --skill  github-ops-excellence \      # skill folder name (or 'instruction/<name>')
#     --title  "Improve X by doing Y" \     # ≤72 chars, imperative
#     --body   "Root cause: ... Change: ... Evidence: ..."
#
# The script will:
#   1. Abort if the working tree is clean (nothing to commit)
#   2. Create a branch  feat/anneal-<skill>-<date>
#   3. Stage and commit only the changed governance file(s)
#   4. Push the branch to origin
#   5. Open a draft PR against main with the provided title and body
#   6. Print the PR URL for the user to review

set -euo pipefail

REPO_DIR="${GOVERNANCE_REPO:-$HOME/copilot-governance}"
cd "$REPO_DIR"

# ── Argument parsing ──────────────────────────────────────────────────

SKILL=""
TITLE=""
BODY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill)  SKILL="$2";  shift 2 ;;
    --title)  TITLE="$2";  shift 2 ;;
    --body)   BODY="$2";   shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$SKILL" || -z "$TITLE" ]]; then
  echo "Usage: $0 --skill <name> --title <imperative title> [--body <description>]" >&2
  exit 1
fi

if [[ ${#TITLE} -gt 72 ]]; then
  echo "ERROR: --title must be ≤72 characters (currently ${#TITLE})." >&2
  exit 1
fi

# ── Preflight checks ──────────────────────────────────────────────────

if ! command -v gh &>/dev/null; then
  echo "ERROR: gh CLI is not installed. Install from https://cli.github.com/ and run 'gh auth login'." >&2
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "ERROR: gh is not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "Nothing to commit — working tree is clean. No PR created." >&2
  exit 0
fi

# ── Branch, commit, push ──────────────────────────────────────────────

DATE="$(date -u +%Y%m%d)"
SLUG="$(echo "$SKILL" | tr '/' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')"
BRANCH="feat/anneal-${SLUG}-${DATE}"

# If the branch already exists (re-run after partial failure), reuse it.
if git rev-parse --verify "$BRANCH" &>/dev/null; then
  echo "Branch $BRANCH already exists — reusing it."
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH"
fi

git add -A
git commit -m "feat(${SKILL}): ${TITLE}

${BODY}

Auto-committed by sync/create-pr.sh on $(hostname) at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

git push --set-upstream origin "$BRANCH"

# ── Open the PR ───────────────────────────────────────────────────────

PR_BODY="## What changed
${TITLE}

## Why
${BODY:-_No body provided. Edit this PR to add context before approving._}

---
*Opened automatically by \`sync/create-pr.sh\` after a self-annealing session on \`$(hostname)\`.*
*Review the diff carefully before approving — this will propagate to all machines on the next pull cycle.*"

PR_URL="$(gh pr create \
  --base main \
  --head "$BRANCH" \
  --title "$TITLE" \
  --body "$PR_BODY" \
  --draft)"

echo ""
echo "✅  Draft PR created: $PR_URL"
echo ""
echo "Review the diff, edit if needed, then approve and merge."
echo "All other machines will receive the change within 15 minutes of merge."
echo ""

# Return to main so the pull timer continues to work correctly.
git checkout main
