#!/usr/bin/env python3
"""#2967: one-ticket-per-worktree baton guard.

Deterministic, provider-neutral guard that blocks emitting an Agile baton
artifact (MANAGER_HANDOFF / COLLABORATOR_HANDOFF / ADMIN_HANDOFF /
CONSULTANT_CLOSEOUT) for a SECOND ticket from a worktree whose active ticket
still has an unresolved baton.

Design goals:
- Provider-neutral: a pure function over (command string, governance state).
  All four runtimes (Claude Code / Copilot / Codex / Antigravity) shell out to
  `gh issue comment`, so the same command form yields the same verdict.
- Low false-positive: ONLY the four baton-artifact headers posted to a specific
  issue are guarded. Non-baton coordination comments, follow-on `gh issue
  create`, and label edits are never matched. Sequential per-ticket iteration
  (close ticket A, then start B) stays allowed, and ambiguous/unparseable state
  fails OPEN (returns None) rather than emitting a spurious deny.
"""
from __future__ import annotations

import re
from typing import Any, Callable, Optional

# The four Agile baton artifacts this guard scopes to (ticket-body AC2).
BATON_ARTIFACT_RE = re.compile(
    r"\b(MANAGER_HANDOFF|COLLABORATOR_HANDOFF|ADMIN_HANDOFF|CONSULTANT_CLOSEOUT)\b"
)
# `gh issue comment <N>` — the cross-runtime way every ADK posts an artifact.
ISSUE_COMMENT_RE = re.compile(r"\bgh\s+issue\s+comment\s+#?(\d+)\b")
# `--body-file <path>` (or `--body-file=<path>`) whose content holds the artifact.
BODY_FILE_RE = re.compile(r"--body-file[=\s]+(\S+)")
# Documented multi-close batch carve-out: sibling brief-evidence is allowed.
BATCH_MARKER_RE = re.compile(r"resolved as part of batch with #\d+", re.IGNORECASE)

# Operator kill-switch (parity with other guard opt-outs).
KILL_SWITCH_ENV = "MEGINGJORD_ONE_TICKET_GUARD_OFF"


def _artifact_bearing_text(command: str, body_file_reader: Optional[Callable[[str], str]]) -> str:
    """Return command text plus any --body-file content, for artifact detection.

    Inline `--body "...MANAGER_HANDOFF..."` already lives in the command; a
    `--body-file <path>` post keeps the artifact in a file, so we read it via the
    injected reader (which returns '' on any error — never raises).
    """
    text = command
    match = BODY_FILE_RE.search(command)
    if match and body_file_reader is not None:
        try:
            text = text + "\n" + (body_file_reader(match.group(1)) or "")
        except Exception:
            pass  # G6: a body-file read failure must never break the guard
    return text


def detect_baton_post(
    command: str, body_file_reader: Optional[Callable[[str], str]] = None
) -> Optional[tuple[int, str]]:
    """Return (target_ticket, artifact_name) if `command` posts a baton artifact
    to a specific issue, else None.

    None means 'not a one-ticket-guarded action' — the caller allows it.
    """
    issue_match = ISSUE_COMMENT_RE.search(command or "")
    if not issue_match:
        return None
    text = _artifact_bearing_text(command, body_file_reader)
    artifact_match = BATON_ARTIFACT_RE.search(text)
    if not artifact_match:
        return None
    if BATCH_MARKER_RE.search(text):
        return None  # documented multi-close batch sibling evidence — allowed
    return int(issue_match.group(1)), artifact_match.group(1)


def _active_ticket_unresolved(state: dict[str, Any]) -> bool:
    """The active ticket counts as an unresolved baton only when it shows recorded
    baton activity AND has not been closed this session. Requiring activity keeps a
    stale active_ticket pointer (set but never worked) from blocking — a key
    false-positive guard.
    """
    if state.get("admin_ops", {}).get("issue_close"):
        return False  # active ticket already closed — sequential iteration is fine
    roles = state.get("roles", {}) or {}
    return any(bool(value) for value in roles.values())


def check_one_ticket_per_worktree(
    command: str,
    state: dict[str, Any],
    body_file_reader: Optional[Callable[[str], str]] = None,
    env: Optional[dict[str, str]] = None,
) -> Optional[str]:
    """Return a deny-reason string when `command` would post a baton artifact for a
    second, different, still-unresolved ticket from this worktree; else None.

    Pure and provider-neutral: depends only on the command and governance state.
    """
    import os
    env = env if env is not None else os.environ
    if env.get(KILL_SWITCH_ENV) == "1":
        return None
    post = detect_baton_post(command, body_file_reader)
    if post is None:
        return None
    target, artifact = post
    active = state.get("active_ticket")
    if active in (None, "", 0):
        return None  # no active ticket — this becomes the worktree's ticket
    try:
        active_num = int(active)
    except (TypeError, ValueError):
        return None  # unparseable active ticket — fail open, never a false deny
    if active_num == target:
        return None  # same ticket — allowed
    if not _active_ticket_unresolved(state):
        return None  # prior ticket resolved — sequential iteration allowed
    return (
        f"One ticket per worktree (#2967): this worktree's active baton is #{active_num}, "
        f"still unresolved (not closed). Refusing to post {artifact} for #{target}. "
        f"Finish #{active_num} (CONSULTANT_CLOSEOUT + gh issue close) or use a separate "
        f"worktree for #{target}."
    )
