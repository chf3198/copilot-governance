#!/usr/bin/env python3
"""it_bypass_emit.py — IT-ops bypass usage telemetry emitter. Refs #2351.

Emits one JSONL line to ~/.megingjord/it-bypass-usage.jsonl per bypass event.
Best-effort: never raises to caller.
"""
from __future__ import annotations
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

BYPASS_LOG = Path.home() / ".megingjord" / "it-bypass-usage.jsonl"
SERVICE = "pretool_guard"


def _get_commit_sha(cwd: str | None = None) -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=cwd or os.getcwd(),
            capture_output=True, text=True, check=False, timeout=3,
        )
        sha = (result.stdout or "").strip()
        return sha if sha else None
    except Exception:
        return None


def _get_commit_subject(cwd: str | None = None) -> str | None:
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%s"],
            cwd=cwd or os.getcwd(),
            capture_output=True, text=True, check=False, timeout=3,
        )
        subject = (result.stdout or "").strip()
        return subject if subject else None
    except Exception:
        return None


def build_event(marker: str, cwd: str | None = None) -> dict:
    commit_sha = _get_commit_sha(cwd)
    justification = _get_commit_subject(cwd)
    return {
        "version": 3,
        "ts": datetime.now(timezone.utc).isoformat(),
        "service": SERVICE,
        "env": "test" if os.environ.get("NODE_ENV") == "test" else "local",
        "event": "it_ops.bypass_used",
        "marker": marker,
        "commit_sha": commit_sha,
        "justification": justification,
        "_summary": f"IT-ops bypass marker={marker} sha={commit_sha}",
    }


def emit_bypass(marker: str, cwd: str | None = None) -> bool:
    """Emit bypass event to ~/.megingjord/it-bypass-usage.jsonl. Best-effort."""
    try:
        event = build_event(marker, cwd)
        BYPASS_LOG.parent.mkdir(parents=True, exist_ok=True)
        with BYPASS_LOG.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(event) + "\n")
        return True
    except Exception:
        return False
