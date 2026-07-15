#!/usr/bin/env python3
"""Session blast-radius caps for file edits, pushes, and estimated provider cost."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ENV_BYPASS = "MEGINGJORD_BLAST_RADIUS_DISABLED"
COST_PER_CALL_USD = 0.05
DEFAULT_CAPS = {
    "max_files_per_session": 1000,
    "max_pushes_per_session": 50,
    "max_cost_usd_per_session": 20.00,
}


def load_caps(cwd: str) -> dict[str, float]:
    path = Path(cwd) / "config" / "governance-rules.yaml"
    if not path.exists():
        return dict(DEFAULT_CAPS)
    text = path.read_text(encoding="utf-8")
    match = re.search(r"^blast_radius_caps:\s*$([\s\S]+?)(?=^\S|\Z)", text, re.MULTILINE)
    if not match:
        return dict(DEFAULT_CAPS)
    block = match.group(1)
    caps = dict(DEFAULT_CAPS)
    for key in caps:
        item = re.search(rf"^\s+{re.escape(key)}:\s*([0-9]+(?:\.[0-9]+)?)\s*$", block, re.MULTILINE)
        if item:
            caps[key] = float(item.group(1))
    return caps


def _as_int(d: dict[str, Any], key: str) -> int:
    try:
        return int(d.get(key, 0) or 0)
    except Exception:
        return 0


def estimated_cost_usd(blast: dict[str, Any]) -> float:
    return round(_as_int(blast, "provider_call_count") * COST_PER_CALL_USD, 2)


def check_caps(blast: dict[str, Any], caps: dict[str, float]) -> str | None:
    files_count = _as_int(blast, "files_edited_count")
    push_count = _as_int(blast, "push_count")
    est_cost = estimated_cost_usd(blast)
    if files_count > int(caps["max_files_per_session"]):
        return f"files_edited_count={files_count} > max_files_per_session={int(caps['max_files_per_session'])}"
    if push_count > int(caps["max_pushes_per_session"]):
        return f"push_count={push_count} > max_pushes_per_session={int(caps['max_pushes_per_session'])}"
    if est_cost > float(caps["max_cost_usd_per_session"]):
        cap = float(caps["max_cost_usd_per_session"])
        return f"estimated_cost_usd={est_cost:.2f} > max_cost_usd_per_session={cap:.2f}"
    return None


def emit_cap_incident(reason: str, cwd: str, override: bool = False) -> None:
    try:
        path = Path.home() / ".megingjord" / "incidents.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        event = {
            "version": 3,
            "service": "pretool-guard",
            "env": "local",
            "event": "SESSION_BLAST_RADIUS_CAP",
            "pattern_id": "session-blast-radius-cap",
            "severity": "medium",
            "cwd": cwd,
            "reason": reason,
            "override": bool(override),
            "override_env": ENV_BYPASS if override else None,
        }
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
    except Exception:
        pass
