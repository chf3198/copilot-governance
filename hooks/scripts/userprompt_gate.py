#!/usr/bin/env python3
"""UserPromptSubmit hook: routing context + pre-closeout governance gating."""
import json
import os
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from governance_state import ensure_state, save_state
from baton_handoff_checks import linked_issue_has_authoritative_manager_handoff
from repo_scope import is_repo_enabled
from routing_context import build_route_context, run_fleet_cascade
from semantic_router import classify as semantic_classify
from task_router import apply_route, classify_prompt

FINISH_RE = re.compile(
    r"\b(done|finish|finished|complete|completed|close out|wrap up|ship|release)\b",
    re.IGNORECASE,
)
_ADMIN_KEYS = ("commit", "push", "pr_create", "ci_green", "merge")
_EXT_KEYS = ("publish", "release_integrity", "gh_release")


def _admin_missing(state: dict) -> list[str]:
    # Phase guard (#1815 / #1798 sibling): pre-collab "complete work on #N" is scoping, not finish.
    if not state.get("roles", {}).get("collaborator", False):
        return []
    flags, ops = state.get("flags", {}), state.get("admin_ops", {})
    missing = []
    if flags.get("code_touched"):
        missing += [k for k in _ADMIN_KEYS if not ops.get(k)]
    if state.get("repo_type") == "vscode-extension" and flags.get("extension_touched"):
        missing += [k for k in _EXT_KEYS if not ops.get(k)]
    return missing


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    prompt = str(payload.get("prompt", ""))
    cwd = str(payload.get("cwd") or os.getcwd())
    if not is_repo_enabled(cwd):
        return 0

    state = ensure_state(cwd)
    if linked_issue_has_authoritative_manager_handoff(cwd):
        phase = state.get("current_phase", "manager")
        if phase in ("manager", "ready"):
            state["current_phase"] = "collaborator"
    # Layer 0: semantic pre-classifier (zero cost, <1ms)
    semantic = semantic_classify(prompt)
    # Layer 1+: keyword classifier (falls through if semantic is unclear)
    route = classify_prompt(prompt)
    if semantic.get("tier") and semantic.get("confidence") == "high":
        lane_map = {"free": "free", "fleet": "fleet", "premium": "premium"}
        if semantic["tier"] in lane_map:
            route = route or {}
            route["lane"] = lane_map[semantic["tier"]]
            route["rationale"] = f"semantic:{semantic['intent']}"
    apply_route(state, route)

    words = prompt.split()
    cascade_result = None
    if route and route.get("lane") == "fleet" and len(words) >= 6:
        cascade_result = run_fleet_cascade(prompt, state)

    save_state(state)

    context_parts = []
    if cascade_result and cascade_result.get("ok") and not cascade_result.get("escalation_needed"):
        context_parts.append(f"[Fleet response]\n{cascade_result['content']}\n[/Fleet response]")
    if route and len(words) >= 6:
        context_parts.append(build_route_context(route, cascade_result))

    if not FINISH_RE.search(prompt):
        if context_parts:
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": "\n\n".join(context_parts),
            }}))
        return 0

    missing = _admin_missing(state)
    if not missing:
        return 0

    msg = "Finish intent detected, but Admin baton is incomplete. Missing: " + ", ".join(missing) + "."
    if context_parts:
        msg = context_parts[-1] + " " + msg
    print(json.dumps({
        "hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": msg},
        "systemMessage": "Governance gate: completion requested before required Admin steps were recorded.",
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
