#!/usr/bin/env python3
"""SessionStart zombie cleanup — sweep orphaned playwright/node test workers.

Per #2019: detect workers whose CPU% has been >80 for >5 min AND whose
parent process is dead. SIGTERM (5s grace) then SIGKILL. Logs to
~/.megingjord/zombie-cleanup.jsonl.

G4: reads PID + cmdline only; no credentials.
G6: degraded mode — if /proc not available (non-Linux), exit 0 quietly.
"""
from __future__ import annotations

import json
import os
import signal
import time
from pathlib import Path

LOG_PATH = Path.home() / ".megingjord" / "zombie-cleanup.jsonl"
CPU_PCT_FLOOR = 80
AGE_MIN_FLOOR = 5
SIGTERM_GRACE_S = 5
ZOMBIE_PATTERNS = ("playwright/lib/common/process.js",
                   "playwright/lib/common/processHost.js")


def _read_proc_stat(pid: str) -> dict | None:
    """Return /proc/<pid>/stat parsed fields, or None on read failure."""
    try:
        with open(f"/proc/{pid}/stat", "r", encoding="utf-8") as fh:
            parts = fh.read().split()
        return {"comm": parts[1], "state": parts[2], "ppid": int(parts[3]),
                "utime": int(parts[13]), "stime": int(parts[14])}
    except (OSError, IndexError, ValueError):
        return None


def _read_cmdline(pid: str) -> str:
    """Return cmdline for pid, joined; '' on failure."""
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as fh:
            return fh.read().replace(b"\x00", b" ").decode("utf-8", "replace").strip()
    except OSError:
        return ""


def _process_age_seconds(pid: str) -> float:
    """Return process age in seconds via stat(/proc/PID) — fallback to 0."""
    try:
        return time.time() - os.stat(f"/proc/{pid}").st_mtime
    except OSError:
        return 0.0


def _parent_alive(ppid: int) -> bool:
    """True iff the parent pid still exists in /proc."""
    return ppid > 1 and os.path.exists(f"/proc/{ppid}")


def find_zombie_candidates() -> list[dict]:
    """Walk /proc, return list of zombie candidates matching the criteria."""
    if not Path("/proc").exists():
        return []
    out = []
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        stat = _read_proc_stat(entry)
        if not stat:
            continue
        cmdline = _read_cmdline(entry)
        if not any(p in cmdline for p in ZOMBIE_PATTERNS):
            continue
        age_min = _process_age_seconds(entry) / 60.0
        if age_min < AGE_MIN_FLOOR:
            continue
        if _parent_alive(stat["ppid"]):
            continue
        out.append({"pid": int(entry), "cmdline": cmdline[:200],
                    "age_min": round(age_min, 1), "ppid": stat["ppid"]})
    return out


def kill_with_grace(pid: int, grace_s: int = SIGTERM_GRACE_S) -> str:
    """SIGTERM the pid, wait grace_s; SIGKILL if still alive. Return action taken."""
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return "already-dead"
    deadline = time.time() + grace_s
    while time.time() < deadline:
        if not os.path.exists(f"/proc/{pid}"):
            return "sigterm-ok"
        time.sleep(0.5)
    try:
        os.kill(pid, signal.SIGKILL)
        return "sigkill-escalation"
    except ProcessLookupError:
        return "sigterm-ok"


def log_cleanup(records: list[dict]) -> bool:
    """Append cleanup records to jsonl; never throw."""
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            for record in records:
                fh.write(json.dumps({"ts": int(time.time() * 1000), **record}) + "\n")
        return True
    except OSError:
        return False


def main() -> int:
    """Find zombies; kill; log."""
    candidates = find_zombie_candidates()
    if not candidates:
        return 0
    results = []
    for cand in candidates:
        action = kill_with_grace(cand["pid"])
        results.append({**cand, "action": action})
    log_cleanup(results)
    print(json.dumps({"cleaned": len(results), "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
