#!/usr/bin/env python3
"""C2: On session-start, archive prior state and create fresh state for new ID."""
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


def _archive_dir() -> Path:
    return Path.home() / ".megingjord" / "state-archive"


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


def _cleanup_orphaned_tmp(directory: Path) -> None:
    if not directory.exists():
        return
    for p in directory.glob("*.tmp"):
        try:
            p.unlink()
        except OSError:
            pass


def rotate(cwd: str) -> None:
    """Archive existing state for prior session; prepare fresh state dir."""
    root = state_root()
    _cleanup_orphaned_tmp(root)
    sid = _session_id()
    if not sid:
        return  # AC6: no-op when session ID unavailable
    short = sid[:8]
    archive_base = _archive_dir() / short
    # Archive all existing repo state files for this cwd-hash prefix
    import hashlib
    repo_key = hashlib.sha1(cwd.encode()).hexdigest()[:16]
    pattern = f"repo-{repo_key}-*.json"
    prior_files = list(root.glob(pattern))
    if not prior_files:
        return  # AC6: nothing to archive
    archive_base.mkdir(parents=True, exist_ok=True)
    for prior in prior_files:
        try:
            data = json.loads(prior.read_text(encoding="utf-8"))
            ts = int(time.time())
            dest = archive_base / f"{prior.stem}-{ts}.json"
            _atomic_write(dest, data)
            prior.unlink()
        except Exception as exc:
            raise RuntimeError(f"State rotation failed: {exc}") from exc  # AC4


if __name__ == "__main__":
    rotate(os.getcwd())
