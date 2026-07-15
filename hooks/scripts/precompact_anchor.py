#!/usr/bin/env python3
"""PreCompact hook: re-inject governance anchor before context compaction.

When the context window is compacted, governance state can be lost.
This hook ensures critical rules survive by injecting a compact
anchor into the systemMessage that persists through compaction.
"""
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from governance_state import ensure_state

ANCHOR = (
    "GOVERNANCE ANCHOR (survives compaction): "
    "1) One ticket per branch — feat/<N>-desc or fix/<N>-desc. "
    "2) Manager scope comment BEFORE any file edits. "
    "3) Commits MUST reference ticket (#N) — deny on missing. "
    "4) One branch = one ticket = one PR. No bundling. "
    "5) Baton: Manager→Collaborator→Admin→Consultant."
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    cwd = payload.get("cwd") or os.getcwd()
    state = ensure_state(cwd)

    ticket = state.get("active_ticket")
    roles = state.get("roles", {})
    flags = state.get("flags", {})
    active_role = next(
        (r for r in ("manager", "collaborator", "admin", "consultant")
         if roles.get(r)), "none"
    )

    parts = [ANCHOR]
    if ticket:
        parts.append(f"Active ticket: #{ticket}.")
    parts.append(f"Current baton: {active_role}.")
    if any(flags.get(k) for k in ("code_touched", "docs_touched", "extension_touched")):
        parts.append("If significant work is complete, add a wiki log entry before stop.")

    out = {
        "hookSpecificOutput": {
            "hookEventName": "PreCompact",
            "additionalContext": " ".join(parts),
        }
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
