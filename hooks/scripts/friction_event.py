"""Per-team friction-event emitter (#3165, Epic #3008/#3095).

Python sibling of scripts/global/friction-event.js. emit_friction writes a REDACTED
schema-v3 event tagged ``tier: 1`` + ``pattern_id`` + ``severity`` to
``~/.megingjord/incidents.jsonl`` so the existing anneal-tier2-autofile recurrence
model promotes recurring frictions to Tier-2. Redaction mirrors the subset in
baton_event_emitter.py (G4: redact at the instrumentation site, not at storage).
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Optional

SCHEMA_VERSION = 3
FRICTION_EVENT = "governance.friction"
SEVERITIES = ("low", "medium", "high", "critical")
DEFAULT_SEVERITY = "low"
INCIDENTS_LOG_PATH = Path.home() / ".megingjord" / "incidents.jsonl"

_REDACTION_PATTERNS = [
    (re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}"), "<ANTHROPIC_KEY_REDACTED>"),
    (re.compile(r"sk-(?!ant-)[A-Za-z0-9_-]{20,}"), "<OPENAI_KEY_REDACTED>"),
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"), "<GITHUB_PAT_REDACTED>"),
    (re.compile(r"Bearer [A-Za-z0-9_.-]{20,}"), "Bearer <REDACTED>"),
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), "<EMAIL_REDACTED>"),
]


def _redact(value: Any) -> Any:
    """Recursively redact secret-bearing strings; structure is preserved."""
    if isinstance(value, str):
        out = value
        for pattern, replacement in _REDACTION_PATTERNS:
            out = pattern.sub(replacement, out)
        return out
    if isinstance(value, dict):
        return {k: _redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


def build_friction_event(pattern_id: str, fields: Optional[dict] = None,
                         now: Optional[str] = None) -> dict:
    """Build the schema-v3 friction event (matches the JS buildFrictionEvent shape)."""
    fields = fields or {}
    severity = fields.get("severity")
    if severity not in SEVERITIES:
        severity = DEFAULT_SEVERITY
    event = {
        "version": SCHEMA_VERSION,
        "ts": now or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "service": "friction",
        "env": fields.get("env", "local"),
        "event": FRICTION_EVENT,
        "tier": 1,
        "pattern_id": pattern_id,
        "team": fields.get("team", "unknown"),
        "runtime": fields.get("runtime", "unknown"),
        "role": fields.get("role"),
        "surface": fields.get("surface"),
        "severity": severity,
        "workaround": fields.get("workaround"),
        "trigger_role": fields.get("role") or "system",
        "trigger_type": "friction",
    }
    if fields.get("cost") is not None:
        event["cost"] = fields["cost"]
    if fields.get("detail"):
        event["detail"] = fields["detail"]
    return event


def is_valid_friction(event: dict) -> bool:
    """True when the event is a well-formed friction event."""
    return bool(
        isinstance(event, dict)
        and event.get("event") == FRICTION_EVENT
        and event.get("pattern_id")
        and event.get("tier") == 1
        and event.get("severity") in SEVERITIES
    )


def emit_friction(pattern_id: str, fields: Optional[dict] = None,
                  path: Optional[Path] = None) -> Optional[dict]:
    """Append one redacted friction event to incidents.jsonl. Never raises."""
    try:
        target = Path(path) if path else INCIDENTS_LOG_PATH
        event = _redact(build_friction_event(pattern_id, fields))
        if not is_valid_friction(event):
            return None
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
        return event
    except Exception:
        return None  # observability emission must never break a caller
