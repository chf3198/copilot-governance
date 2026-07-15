#!/usr/bin/env python3
"""SubagentStart hook: inject governance context into sub-agents.

Sub-agents spawned via runSubagent operate without the parent's
governance context. This hook injects the governance anchor and
active ticket state so sub-agents respect the same constraints.
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
    "SUBAGENT GOVERNANCE (inherited from parent): "
    "1) One ticket per branch — feat/<N>-desc or fix/<N>-desc. "
    "2) Commits MUST reference ticket (#N). "
    "3) Do NOT create branches or PRs unless explicitly scoped. "
    "4) Report findings back — do not take admin actions."
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    cwd = payload.get("cwd") or os.getcwd()
    state = ensure_state(cwd)

    ticket = state.get("active_ticket")
    parts = [ANCHOR]
    if ticket:
        parts.append(f"Parent active ticket: #{ticket}.")
    parts.append(
        f"Repo type: {state.get('repo_type', 'generic')}."
    )

    out = {
        "hookSpecificOutput": {
            "hookEventName": "SubagentStart",
            "additionalContext": " ".join(parts),
        }
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
