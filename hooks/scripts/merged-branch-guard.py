#!/usr/bin/env python3
"""Merged-branch-guard runner for lefthook pre-push. Refs #2878 (AC-I3.2).

Calls check_merged_pr() from live_checks and exits non-zero if the current
branch already has a merged PR, preventing stale-branch pushes.
"""
import os, subprocess, sys
from pathlib import Path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from live_checks import check_merged_pr


def _current_branch() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "branch", "--show-current"],
            text=True, stderr=subprocess.DEVNULL,
        ).strip() or None
    except Exception:
        return None


if __name__ == "__main__":
    cwd = os.getcwd()
    branch = _current_branch()
    if branch:
        pr = check_merged_pr(branch, cwd)
        if pr:
            print(
                f"merged-branch-guard: BLOCKED — branch '{branch}' was already "
                f"merged via PR #{pr}. Check out a new branch from main.",
                file=sys.stderr,
            )
            sys.exit(1)
    sys.exit(0)
