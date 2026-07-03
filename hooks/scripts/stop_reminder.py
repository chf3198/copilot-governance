#!/usr/bin/env python3
"""Stop hook: governance-aware session completion reminder.

Delegates git state detection to git_checks and admin completion
logic to stop_checks. Orchestrates blocking decisions and messages.
"""
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from git_checks import detect_session_signals, detect_uncommitted_changes
from governance_state import ensure_state, reset_on_branch_change, save_state
from stop_checks import (
    check_admin_ops, check_uncommitted, post_merge_messages, wiki_pending_message,
)
from client_arbitration_guard import (
    classify_internal_conflict,
    detect_client_arbitration,
    emit_incident,
    extract_assistant_text,
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    if payload.get("stop_hook_active"):
        return 0

    cwd = payload.get("cwd") or os.getcwd()
    state = ensure_state(cwd)
    import subprocess
    try:
        branch = subprocess.check_output(["git","rev-parse","--abbrev-ref","HEAD"],
                                         cwd=cwd, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        branch = None
    state = reset_on_branch_change(cwd, branch)
    signals = detect_session_signals(cwd)
    uncommitted = detect_uncommitted_changes(cwd)
    flags = state.get("flags", {})
    ops = state.get("admin_ops", {})
    roles = state.get("roles", {})
    repo_type = state.get("repo_type", "generic")

    messages = []
    block_reason = None

    assistant_text = extract_assistant_text(payload)
    violations = detect_client_arbitration(assistant_text)
    if violations:
        emit_incident("client-arbitration-output-leak", evidence=violations)
        block_reason = "Stop blocked: client-arbitration leakage detected."
        messages.append(
            "CLIENT-ARBITRATION GUARDRAIL BLOCK — internal governance/worktree/team "
            "conflicts must be resolved by the operator, not delegated to the client."
        )

    if not block_reason:
        block_reason, msg = check_uncommitted(uncommitted, roles)
    else:
        msg = None
    if msg:
        messages.append(msg)

    conflict = classify_internal_conflict(uncommitted)
    if conflict.get("type") != "none":
        emit_incident(
            "internal-conflict-auto-resolution-required",
            evidence=[conflict["type"], *conflict.get("files", [])[:5]],
            severity="medium",
        )
        if not block_reason:
            block_reason = "Stop blocked: unresolved internal conflict requires deterministic operator resolution."
        policy = " | ".join(conflict.get("policy", []))
        messages.append(
            f"INTERNAL-CONFLICT POLICY ({conflict['type']}): {policy}"
        )

    if not block_reason:
        # #3266: a clean lane:research session is PR-less/merge-less by design — require ZERO
        # Admin ops so a lingering code_touched flag cannot manufacture a phantom Admin nag.
        # A dirty tree removes the exemption (nothing-to-merge is the whole justification).
        research_clean_exempt = False
        try:
            from pretool_guard import active_ticket_is_research_lane
            research_clean_exempt = (
                bool(active_ticket_is_research_lane(state, cwd)) and not uncommitted)
        except Exception:
            research_clean_exempt = False  # fail-safe: fall back to the standard Admin-op gate
        block_reason, msg = check_admin_ops(
            flags, ops, roles, repo_type, uncommitted, research_clean_exempt)
        if msg:
            messages.append(msg)

    messages.extend(post_merge_messages(signals, bool(messages), ops))
    wiki_msg = wiki_pending_message(cwd, flags, ops)
    if wiki_msg:
        messages.append(wiki_msg)

    drift = state.get("drift", {})
    total_c = drift.get("commits", 0)
    if total_c > 0:
        rate = (total_c - drift.get("commits_with_ticket", 0)) / total_c * 100
        messages.append(f"📊 Drift score: {rate:.0f}% ticketless ({total_c} commits this session).")

    out = {"systemMessage": "\n\n".join(messages)}
    if block_reason:
        out["decision"] = "block"
        out["reason"] = block_reason

    if not block_reason:
        roles["consultant"] = True
        save_state(state)

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
