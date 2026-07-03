#!/usr/bin/env python3
"""Guardrail for client-arbitration leakage and internal conflict policy."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
import re

INCIDENTS_LOG = Path.home() / ".megingjord" / "incidents.jsonl"

CONFLICT_CONTEXT_RE = re.compile(
    r"\b(governance|worktree|branch|drift|conflict|lease|sync(?:\s|-)?residue|team)\b",
    re.IGNORECASE,
)
FORBIDDEN_ASK_RE = re.compile(
    r"\b(how\s+would\s+you\s+like\s+(?:me\s+)?to\s+proceed|"
    r"which\s+option\s+should\s+i\s+take|"
    r"let\s+me\s+know\s+how\s+you\s+want\s+to\s+proceed|"
    r"please\s+choose\s+(?:one|an?\s+option)|"
    r"what\s+should\s+i\s+do\s+next)\b",
    re.IGNORECASE,
)
DESIGN_UAT_RE = re.compile(
    r"\b(design|layout|theme|color|typography|ux|ui|uat|visual\s+confirmation|look\s+and\s+feel)\b",
    re.IGNORECASE,
)

SYNC_RESIDUE_FILES = {
    "scripts/global/post-merge-sweep.js",
}
SYNC_RESIDUE_DIRS = (
    "wiki/concepts/",
    "wiki/entities/",
    "wiki/skills/",
    "wiki/sources/",
    "wiki/syntheses/",
)


def extract_assistant_text(payload: dict) -> str:
    """Best-effort extraction of assistant output from hook payload."""
    keys = ("assistant_response", "response", "output", "final_response", "message")
    for key in keys:
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return ""


def detect_client_arbitration(text: str) -> list[str]:
    """Return violations when assistant delegates internal conflict decisions."""
    if not text or DESIGN_UAT_RE.search(text):
        return []
    if FORBIDDEN_ASK_RE.search(text) and CONFLICT_CONTEXT_RE.search(text):
        return ["delegated-internal-conflict-decision-to-client"]
    return []


def classify_internal_conflict(uncommitted: list[str]) -> dict:
    """Deterministic classifier for common internal conflict classes."""
    files = [f.strip() for f in (uncommitted or []) if f and f.strip()]
    if not files:
        return {"type": "none", "files": [], "policy": []}

    if any(f in SYNC_RESIDUE_FILES for f in files) or any(
        f.startswith(prefix) for f in files for prefix in SYNC_RESIDUE_DIRS
    ):
        return {
            "type": "sync-residue",
            "files": files,
            "policy": [
                "git restore scripts/global/post-merge-sweep.js",
                "git clean -fd wiki/concepts wiki/entities wiki/skills wiki/sources wiki/syntheses",
                "git status --short",
            ],
        }

    if any("cross-team-leases.json" in f for f in files):
        return {
            "type": "cross-team-lease-collision",
            "files": files,
            "policy": [
                "node scripts/global/cross-team-conflict-gate.js --post-comment 1",
                "apply manager adjudication from issue thread",
                "continue on lease owner decision without client escalation",
            ],
        }

    return {
        "type": "worktree-drift",
        "files": files,
        "policy": [
            "preserve-first: commit to rescue branch OR revert local drift deterministically",
            "record evidence in issue comment",
            "continue delivery without client arbitration",
        ],
    }


def emit_incident(pattern_id: str, evidence: list[str] | None = None, severity: str = "high") -> bool:
    """Best-effort incident emission for anneal pipelines."""
    event = {
        "version": 3,
        "ts": datetime.now(timezone.utc).isoformat(),
        "service": "stop-hook-client-arbitration-guard",
        "env": "local",
        "event": "governance.client_arbitration_block",
        "pattern_id": pattern_id,
        "severity": severity,
        "evidence": evidence or [],
    }
    try:
        INCIDENTS_LOG.parent.mkdir(parents=True, exist_ok=True)
        with INCIDENTS_LOG.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(event) + "\n")
        return True
    except Exception:
        return False
