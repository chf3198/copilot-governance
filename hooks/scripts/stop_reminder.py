#!/usr/bin/env python3
"""Stop hook: governance-aware session completion reminder.

Detects whether the session involved code changes, merges, or deploys,
and reminds the agent about specific post-merge governance skills.
"""
import json
import os
import subprocess
import sys
from pathlib import Path


def detect_session_signals(cwd: str) -> list[str]:
    """Detect what happened in this session by checking git state."""
    signals = []
    try:
        # Check for recent commits (last 2 hours) that suggest a merge/deploy happened
        result = subprocess.run(
            ["git", "log", "--oneline", "--since=2 hours ago", "--no-walk", "HEAD"],
            capture_output=True, text=True, cwd=cwd, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            signals.append("recent-commits")

        # Check if any tracked files were modified in this session
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
            capture_output=True, text=True, cwd=cwd, timeout=5
        )
        if result.returncode == 0:
            changed = result.stdout.strip().split("\n")
            changed = [f for f in changed if f]
            if any(f.endswith(".sh") or f.endswith(".js") or f.endswith(".py") for f in changed):
                signals.append("code-changed")
            if any("README" in f or "CHANGELOG" in f for f in changed):
                signals.append("docs-updated")
            if any(f.startswith("vscode-extension/") for f in changed):
                signals.append("extension-changed")
    except Exception:
        pass
    return signals


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    if payload.get("stop_hook_active"):
        return 0

    cwd = payload.get("cwd") or os.getcwd()
    signals = detect_session_signals(cwd)

    if "code-changed" in signals or "extension-changed" in signals:
        msg = (
            "Post-merge governance checklist — verify before ending:\n"
            "1. CHANGELOG updated for all shipped behavioral changes\n"
            "2. README/docs reflect new behavior (kill hierarchy, commands, settings)\n"
            "3. repo-profile-governance: community health files, metadata, templates\n"
            "4. docs-drift-maintenance: no stale docs contradicting new behavior\n"
            "5. Learnings entry if significant discovery was made\n"
            "If these were already completed or are not applicable, proceed."
        )
    else:
        msg = (
            "Before ending: confirm claimed checks/releases are evidence-backed "
            "and docs are synchronized where behavior/config changed."
        )

    out = {"systemMessage": msg}
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
