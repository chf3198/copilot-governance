#!/usr/bin/env python3
"""C3: On session-end, archive current state to per-session archive dir."""
from __future__ import annotations
import json
import os
import tempfile
import time
from pathlib import Path

from runtime_paths import state_root


def _session_id() -> str:
    env = os.environ.get("MEGINGJORD_SESSION_ID", "").strip()
    if env:
        return env
    sid_file = Path.home() / ".megingjord" / "session.id"
    if sid_file.exists():
        return sid_file.read_text(encoding="utf-8").strip()
    return ""


def _atomic_write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def archive(cwd: str) -> None:
    """Write current state snapshot to per-session archive dir."""
    sid = _session_id()
    if not sid:
        return  # AC3: no-op when no session ID
    import hashlib
    repo_key = hashlib.sha1(cwd.encode()).hexdigest()[:16]
    short = sid[:8]
    # Find active per-session state file
    root = state_root()
    pattern = f"repo-{repo_key}-{short}.json"
    state_file = root / pattern
    if not state_file.exists():
        return  # AC3: no-op when no active state
    try:
        data = json.loads(state_file.read_text(encoding="utf-8"))
    except Exception:
        return
    archive_dir = Path.home() / ".megingjord" / "state-archive" / short
    archive_dir.mkdir(parents=True, exist_ok=True)  # AC4
    ts = int(time.time())
    dest = archive_dir / f"repo-{repo_key}-end-{ts}.json"
    _atomic_write(dest, data)  # AC2


if __name__ == "__main__":
    archive(os.getcwd())
