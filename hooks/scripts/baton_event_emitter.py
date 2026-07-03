"""Append-only baton-events.jsonl emitter (#2457).

Move 2 of Epic #2451: event-source baton transitions for audit + replay.
Schema v3 compliant per scripts/global/event-schema-v3.js. PII redaction at
instrumentation site (G4 privacy).
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Optional

SCHEMA_VERSION = 3
SERVICE = "baton"
DEFAULT_ENV = "local"
EVENT_LOG_PATH = Path.home() / ".megingjord" / "baton-events.jsonl"
DECISIONS_LOG_PATH = Path.home() / ".megingjord" / "decisions.jsonl"
SUMMARY_MAX = 200

# Redaction patterns — mirror subset of scripts/global/log-redaction.js for hook context
_REDACTION_PATTERNS = [
    (re.compile(r'sk-ant-[A-Za-z0-9_-]{20,}'), '[REDACTED:anthropic-key]'),
    (re.compile(r'sk-[A-Za-z0-9]{20,}'), '[REDACTED:openai-key]'),
    (re.compile(r'gh[ps]_[A-Za-z0-9]{20,}'), '[REDACTED:github-pat]'),
    (re.compile(r'Bearer [A-Za-z0-9_.-]{20,}'), 'Bearer [REDACTED]'),
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'), '[REDACTED:email]'),
]


def feature_enabled() -> bool:
    """On by default; disable via MEGINGJORD_BATON_EVENT_LOG=0 (#2918)."""
    return os.environ.get("MEGINGJORD_BATON_EVENT_LOG", "1").strip() != "0"


def redact(text: str) -> str:
    if not isinstance(text, str):
        return text
    out = text
    for pattern, replacement in _REDACTION_PATTERNS:
        out = pattern.sub(replacement, out)
    return out


def _redact_event(event: dict) -> dict:
    """Recursive redaction of free-text fields."""
    return {k: redact(v) if isinstance(v, str) else v for k, v in event.items()}


def emit_baton_event(
    event: str, ticket: Optional[int] = None, *,
    from_role: Optional[str] = None, to_role: Optional[str] = None,
    signer: Optional[str] = None, summary: Optional[str] = None,
    extras: Optional[dict] = None,
) -> bool:
    """Append schema-v3 baton event. Returns True if written, False if disabled.

    Required v3 fields: ts, version, service, env, event.
    Optional: ticket, from, to, signer, trace_id, session_id, _summary.
    """
    if not feature_enabled():
        return False
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "version": SCHEMA_VERSION,
        "service": SERVICE,
        "env": os.environ.get("MEGINGJORD_ENV", DEFAULT_ENV),
        "event": event,
    }
    if ticket is not None: record["ticket"] = int(ticket)
    if from_role: record["from"] = from_role
    if to_role: record["to"] = to_role
    if signer: record["signer"] = signer
    session_id = os.environ.get("MEGINGJORD_SESSION_ID", "").strip()
    if session_id: record["session_id"] = session_id[:16]
    if summary:
        record["_summary"] = redact(summary[:SUMMARY_MAX])
    if extras:
        record.update(_redact_event(extras))
    try:
        EVENT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with EVENT_LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
        return True
    except OSError:
        return False  # G6: never break the baton on log-write failure


def emit_role_handoff(from_role: str, to_role: str, ticket: int, signer: str = "auto") -> bool:
    """Convenience wrapper for the canonical role-transition event."""
    return emit_baton_event(
        "role-handoff", ticket=ticket,
        from_role=from_role, to_role=to_role, signer=signer,
        summary=f"{from_role} -> {to_role} on #{ticket}",
    )


def emit_decision(
    role: str, decision_type: str, verdict: str, *,
    ticket: Optional[int] = None,
    input_summary: Optional[str] = None,
    rationale: Optional[str] = None,
) -> bool:
    """Append structured governance decision to decisions.jsonl (#2918, G-19)."""
    if not feature_enabled():
        return False
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "version": SCHEMA_VERSION,
        "service": SERVICE,
        "env": os.environ.get("MEGINGJORD_ENV", DEFAULT_ENV),
        "event": "governance.decision",
        "role": role,
        "decision_type": decision_type,
        "verdict": verdict,
    }
    if ticket is not None:
        record["ticket"] = int(ticket)
    if input_summary:
        record["input_summary"] = redact(input_summary[:SUMMARY_MAX])
    if rationale:
        record["rationale"] = redact(rationale[:SUMMARY_MAX])
    try:
        DECISIONS_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with DECISIONS_LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
        return True
    except OSError:
        return False  # G6: never break on log-write failure
