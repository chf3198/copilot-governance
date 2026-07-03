"""Antigravity-signer advisory guard (#2471).

Phase-1 Move 1 of Epic #2362: detects commits authored by Antigravity-team
signers landing on main and emits advisory incident. Does NOT block
(Tier B++ caution per Phase-0 #2470 honest scope guard).

Feature-flagged MEGINGJORD_ANTIGRAVITY_GUARD. When off, all checks no-op.
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Optional

INCIDENTS_PATH = Path.home() / ".megingjord" / "incidents.jsonl"
ANTIGRAVITY_TEAM_RE = re.compile(r"\bantigravity\b", re.IGNORECASE)
SIGNED_BY_RE = re.compile(r"^Signed-by:\s*(.+)$", re.MULTILINE)
TEAM_MODEL_RE = re.compile(r"^(?:AI-)?Team[&-]?Model:\s*(.+)$", re.MULTILINE | re.IGNORECASE)


def feature_enabled() -> bool:
    return os.environ.get("MEGINGJORD_ANTIGRAVITY_GUARD", "").strip() == "1"


def is_antigravity_signed(text: str) -> bool:
    """Detect Antigravity-team signer based on Team&Model trailer."""
    if not text:
        return False
    for m in TEAM_MODEL_RE.finditer(text):
        if ANTIGRAVITY_TEAM_RE.search(m.group(1)):
            return True
    return False


def extract_signer_alias(text: str) -> Optional[str]:
    m = SIGNED_BY_RE.search(text or "")
    return m.group(1).strip() if m else None


def emit_incident(pattern_id: str, evidence: dict) -> bool:
    """Append v3 incident event to ~/.megingjord/incidents.jsonl."""
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "version": 3,
        "service": "antigravity-guard",
        "env": os.environ.get("MEGINGJORD_ENV", "local"),
        "event": "advisory-detection",
        "tier": "advisory",
        "trigger_role": "system",
        "trigger_type": "signer-pattern",
        "pattern_id": pattern_id,
        "severity": "low",
        "evidence": evidence,
    }
    try:
        INCIDENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with INCIDENTS_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
        return True
    except OSError:
        return False


def check_commit_message(message: str, branch: str = "") -> dict:
    """Return decision dict. 'allow' always True (advisory mode).
    If detection fires AND branch == 'main', incident is logged.
    """
    if not feature_enabled():
        return {"allow": True, "advisory": False, "reason": "guard-disabled"}
    if not is_antigravity_signed(message):
        return {"allow": True, "advisory": False, "reason": "not-antigravity-signed"}
    signer = extract_signer_alias(message) or "unknown"
    advisory = {"allow": True, "advisory": True,
                "reason": "antigravity-signer-detected", "signer": signer, "branch": branch}
    if branch == "main":
        emit_incident("antigravity-commit-on-main", {
            "signer": signer, "branch": branch,
            "message_preview": message[:200],
        })
        advisory["incident_emitted"] = True
    return advisory
