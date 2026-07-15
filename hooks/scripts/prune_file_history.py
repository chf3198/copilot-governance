#!/usr/bin/env python3
"""SessionStart hook — prune old Claude Code file-history entries.

Both the repo-local .claude/file-history/ and the global ~/.claude/file-history/
grow unboundedly unless pruned. This hook removes session dirs older than the
number of days specified by PRUNE_DAYS (default 7).

Runs at SessionStart, non-blocking — exits 0 on any failure.

Goals: G6 (resilience — never blocks startup), G10 (bounded cache; refs #2342).
"""
from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path

PRUNE_DAYS: int = int(os.getenv("CLAUDE_HISTORY_PRUNE_DAYS", "7"))
CUTOFF_S: float = time.time() - PRUNE_DAYS * 86400
LOG_PATH = Path.home() / ".megingjord" / "file-history-prune.jsonl"


def _prune_dir(history_dir: Path) -> dict:
    removed, kept, errors = 0, 0, 0
    if not history_dir.is_dir():
        return {"dir": str(history_dir), "skipped": True}
    for entry in history_dir.iterdir():
        if not entry.is_dir():
            continue
        try:
            if entry.stat().st_mtime < CUTOFF_S:
                shutil.rmtree(entry)
                removed += 1
            else:
                kept += 1
        except Exception:  # noqa: BLE001
            errors += 1
    return {"dir": str(history_dir), "removed": removed, "kept": kept, "errors": errors}


def main() -> None:
    targets = [
        Path.home() / ".claude" / "file-history",
        Path(os.getenv("CLAUDE_PROJECT_DIR", ".")) / ".claude" / "file-history",
    ]
    results = [_prune_dir(t) for t in targets]
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "prune_days": PRUNE_DAYS,
            "results": results,
        }) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001
        pass  # never block session start
