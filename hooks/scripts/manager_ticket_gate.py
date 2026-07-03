#!/usr/bin/env python3
"""Manager gate: validate Manager handoff includes ticket before implementation."""
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from governance_state import ensure_state, save_state
from repo_scope import is_repo_enabled
from ticket_helpers import extract_issue_num


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    prompt = str(payload.get("prompt", "")).lower()
    cwd = str(payload.get("cwd") or ".")

    if not is_repo_enabled(cwd):
        return 0

    # Phase guard (#1798/F3): only fire on explicit handoff markers, not common
    # English words like "work" or "task" that produced high false-positive rates.
    if not any(
        m in prompt
        for m in ["manager_handoff", "manager handoff", "scope:", "acceptance:"]
    ):
        return 0

    state = ensure_state(cwd)
    issue_num = extract_issue_num(prompt)

    # Accept state.active_ticket as ticket evidence if prompt has no #N
    # (Manager operating via `gh` CLI on existing tickets is a normal flow).
    if not issue_num:
        issue_num = state.get("active_ticket")

    if issue_num:
        state.setdefault("roles", {})["manager"] = True
        state["active_ticket"] = issue_num
        state["current_phase"] = "manager"
        save_state(state)
        return 0

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": (
                        "Manager handoff detected but no ticket reference found. "
                        "MANAGER_HANDOFF must include a GitHub issue link (e.g., #123)."
                    ),
                },
                "systemMessage": "Ticket-first workflow: Manager must create ticket before scope definition.",
            }
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
