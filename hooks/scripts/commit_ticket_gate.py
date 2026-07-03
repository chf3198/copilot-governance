#!/usr/bin/env python3
"""PreTool: validate commit has ticket linkage if branch has ticket."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from repo_scope import is_repo_enabled
from ticket_helpers import extract_issue_num, extract_from_branch
from governance_state import ensure_state, save_state


def get_current_branch() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return ""


def emit(decision: str, reason: str) -> int:
    hook = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }
    print(json.dumps(hook))
    return 0


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool = str(payload.get("tool_name", ""))
    cwd = str(payload.get("cwd") or os.getcwd())

    if not is_repo_enabled(cwd):
        return 0

    values = list(payload.get("tool_input", {}).values() if isinstance(
        payload.get("tool_input"), dict) else [])
    joined = "\n".join(str(v) for v in values)

    if tool not in {"run_in_terminal", "terminal", "Bash"}:
        return 0

    if "git commit" not in joined:
        return 0

    branch = get_current_branch()
    branch_issue = extract_from_branch(branch)

    if not branch_issue:
        return 0

    commit_issue = extract_issue_num(joined)
    if not commit_issue:
        return emit(
            "deny",
            f"Branch #{branch_issue} requires ticket reference in commit. "
            f"Use: git commit -m \"...(closes #{branch_issue})\"",
        )

    if branch_issue != commit_issue:
        return emit(
            "deny",
            f"Ticket mismatch: branch #{branch_issue} vs commit #{commit_issue}. "
            f"Branch and commit must reference the same ticket.",
        )

    state = ensure_state(cwd)
    d = state.setdefault("drift", {})
    d["commits"] = d.get("commits", 0) + 1
    d["commits_with_ticket"] = d.get("commits_with_ticket", 0) + 1
    save_state(state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
