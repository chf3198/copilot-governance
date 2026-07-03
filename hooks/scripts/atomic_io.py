"""Atomic JSON file helpers (#3033 C5 AC1)."""
from __future__ import annotations
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Callable


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=f"{path.name}.tmp.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def with_json_lock(path: Path, fn: Callable[[dict[str, Any]], Any], default: Callable[[], dict[str, Any]]) -> Any:
    lock = path.with_suffix(path.suffix + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        lock.mkdir(exist_ok=False)
    except FileExistsError:
        raise RuntimeError(f"atomic_io: lock held for {path}") from None
    try:
        data = default()
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                data = default()
        out = fn(data)
        atomic_write_json(path, data)
        return out
    finally:
        lock.rmdir()
