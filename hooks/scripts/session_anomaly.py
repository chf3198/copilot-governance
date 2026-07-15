#!/usr/bin/env python3
"""Session behavioral anomaly detection (#2913, Gap G-15).

Tracks aggregate session counters and emits ANOMALY_DETECTED to
incidents.jsonl when sequence-level thresholds are breached.
ASI05 (Cascading Failures) + EU AI Act Art.14 (Human Oversight).
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

INCIDENTS_PATH = Path.home() / ".megingjord" / "incidents.jsonl"
ENV_ANOMALY_BYPASS = "MEGINGJORD_SESSION_ANOMALY_DISABLED"
DEFAULT_THRESHOLDS: dict[str, int] = {
    "writes_in_session": 250,
    "sensitive_path_reads": 15,
    "pushes_in_session": 25,
}
_SENSITIVE_RE = re.compile(
    r"(?i)(\.env|secrets?[\\/]|credentials?[\\/]|private_key|"
    r"\.pem|\.p12|\.pfx|auth[-_]?token|password|\.ssh[\\/]|"
    r"api[-_]?key|access[-_]?key)",
)


def load_thresholds(cwd: str) -> dict[str, int]:
    """Parse session_anomaly_thresholds block from governance-rules.yaml."""
    path = Path(cwd) / "config" / "governance-rules.yaml"
    if not path.exists():
        return dict(DEFAULT_THRESHOLDS)
    text = path.read_text(encoding="utf-8")
    m = re.search(
        r"^session_anomaly_thresholds:\s*$([\s\S]+?)(?=^\S|\Z)",
        text, re.MULTILINE,
    )
    if not m:
        return dict(DEFAULT_THRESHOLDS)
    block = m.group(1)
    out = dict(DEFAULT_THRESHOLDS)
    for key in out:
        item = re.search(
            rf"^\s+{re.escape(key)}:\s*(\d+)\s*$", block, re.MULTILINE,
        )
        if item:
            out[key] = int(item.group(1))
    return out


def update_session_counters(
    state: dict[str, Any], tool: str, values: list[str],
) -> None:
    """Increment session aggregate counters on each tool invocation."""
    sess = state.setdefault("session", {})
    sess.setdefault("total_writes", 0)
    sess.setdefault("total_reads_sensitive_paths", 0)
    sess.setdefault("total_pushes", 0)
    from tool_activity import EDIT_TOOLS, READ_ONLY_TOOLS
    if tool in EDIT_TOOLS:
        sess["total_writes"] += 1
    if tool in READ_ONLY_TOOLS:
        for v in values:
            if _SENSITIVE_RE.search(v):
                sess["total_reads_sensitive_paths"] += 1
                break
    blast = state.get("blast_radius", {})
    sess["total_pushes"] = int(blast.get("push_count", 0))


def check_anomaly(state: dict[str, Any], cwd: str) -> str | None:
    """Return a denial reason string if any anomaly threshold is breached."""
    sess = state.get("session", {})
    thresholds = load_thresholds(cwd)
    checks = [
        ("total_writes", "writes_in_session"),
        ("total_reads_sensitive_paths", "sensitive_path_reads"),
        ("total_pushes", "pushes_in_session"),
    ]
    for counter_key, threshold_key in checks:
        val = int(sess.get(counter_key, 0))
        limit = thresholds[threshold_key]
        if val > limit:
            return f"{counter_key}={val} > {threshold_key}={limit}"
    return None


def emit_anomaly_incident(reason: str, cwd: str, override: bool = False) -> None:
    """Append ANOMALY_DETECTED v3 event to incidents.jsonl. Never raises.

    #3316: when override is True the breach is still recorded (audited, not
    silent) with the bypass env named, for parity with blast-radius caps.
    """
    try:
        INCIDENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        event = {
            "version": 3,
            "service": "pretool-guard",
            "env": "local",
            "event": "ANOMALY_DETECTED",
            "pattern_id": "session-anomaly-detection",
            "severity": "high",
            "cwd": cwd,
            "reason": reason,
            "gap": "G-15",
            "refs": ["ASI05", "EU-AI-Act-Art14"],
            "override": bool(override),
            "override_env": ENV_ANOMALY_BYPASS if override else None,
        }
        with INCIDENTS_PATH.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(event) + "\n")
    except Exception:
        pass
