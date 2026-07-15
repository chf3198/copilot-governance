#!/usr/bin/env python3
"""Git state detection helpers for hook scripts."""
from __future__ import annotations

import subprocess

CODE_EXTS = (".sh", ".js", ".py")


def detect_session_signals(cwd: str) -> list[str]:
    """Detect session activity by checking recent git state."""
    signals = []
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "--since=2 hours ago",
             "--no-walk", "HEAD"],
            capture_output=True, text=True, cwd=cwd, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            signals.append("recent-commits")
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
            capture_output=True, text=True, cwd=cwd, timeout=5,
        )
        if result.returncode == 0:
            changed = [f for f in result.stdout.strip().split("\n") if f]
            # Gate on recent-commits: only signal code changes from the current
            # session. git diff HEAD~1 HEAD reflects permanent repo history;
            # without this guard, the warning fires in every new session after
            # any code-changing merge (Gap 2, #2005).
            if "recent-commits" in signals:
                if any(f.endswith(e) for f in changed for e in CODE_EXTS):
                    signals.append("code-changed")
                if any(f.startswith("vscode-extension/") for f in changed):
                    signals.append("extension-changed")
            if any("README" in f or "CHANGELOG" in f for f in changed):
                signals.append("docs-updated")
    except Exception:
        pass
    return signals


def detect_uncommitted_changes(cwd: str) -> list[str]:
    """Return list of uncommitted working-tree files."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, cwd=cwd, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            # #3821: split with splitlines() and DO NOT strip the whole stdout first. A
            # `result.stdout.strip()` would eat the leading status space of the FIRST porcelain line,
            # shifting its `line[3:]` by one and corrupting that path (e.g. ".gitignore" -> "gitignore").
            # This must parse identically to session_baseline.snapshot_uncommitted so the Stop
            # session-attributable delta (#3820) is exact.
            return [
                line[3:]
                for line in result.stdout.splitlines()
                if line.strip()
            ]
    except Exception:
        pass
    return []
