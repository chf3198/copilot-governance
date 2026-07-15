#!/usr/bin/env python3
"""Tool activity tracking for governance state."""
from __future__ import annotations

import os
import re
import subprocess
from typing import Any

from baton_event_emitter import emit_role_handoff
from admin_patterns import (
    RE_GH_ISSUE_CLOSE, RE_GH_ISSUE_CREATE, RE_GH_RELEASE_CREATE,
    RE_GIT_COMMIT, RE_GIT_PUSH, RE_PR_CHECKS, RE_PR_CREATE,
    RE_PR_MERGE, RE_RELEASE_INTEGRITY, RE_VSCE_PUBLISH, RE_VSCE_SHOW,
    is_countable_push, iter_strings, required_admin_ops,
)
from repo_detection import classify_path
from session_anomaly import update_session_counters

PATCH_FILE_RE = re.compile(
    r"^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+?)\s*$", re.MULTILINE
)
# Baton artifact names to detect in Bash inputs (gh issue comment bodies).
_BATON_ARTIFACT_RE = re.compile(
    r"\b(MANAGER_HANDOFF|COLLABORATOR_HANDOFF|ADMIN_HANDOFF|CONSULTANT_CLOSEOUT)\b"
)
_BATON_ROLE_MAP = {
    "MANAGER_HANDOFF": ("manager", "manager.handoff"),
    "COLLABORATOR_HANDOFF": ("collaborator", "collaborator.handoff"),
    "ADMIN_HANDOFF": ("admin", "admin.handoff"),
    "CONSULTANT_CLOSEOUT": ("consultant", "consultant.closeout"),
}
# Bash/terminal tools: inputs are shell commands, not file paths.
# Path classification is skipped for these to prevent false code_touched.
BASH_TOOLS = {"run_in_terminal", "terminal", "runTerminalCommand", "Bash", "run_command", "send_command_input"}
EDIT_TOOLS = {
    "apply_patch", "create_file", "edit_notebook_file", "create_new_jupyter_notebook",
    "write_to_file", "replace_file_content", "multi_replace_file_content",
    "replace_string_in_file", "multi_replace_string_in_file",
    # #2978: Claude Code mutator tools (were previously caught only via path-classification —
    # the same branch that mis-fired on read-only Read/Grep/Glob).
    "Edit", "Write", "MultiEdit", "NotebookEdit",
}
# #2978: READ-ONLY tools whose inputs contain file paths but NEVER mutate. Excluded from
# path-classification so they cannot set code_touched/docs_touched. This is a DENYLIST (not a
# mutator whitelist): an UNKNOWN non-Bash tool still flips the flags — for a governance gate a
# false-positive (extra nag) is safer than a false-negative (silent mutation bypasses the gate).
READ_ONLY_TOOLS = {
    "Read", "Grep", "Glob", "NotebookRead", "read_file", "grep_search", "file_search",
    "list_dir", "semantic_search", "read_notebook_file", "list_code_usages", "test_search",
}
# #2978: cheap pre-filter for raw-Bash mutations; a match triggers a real `git diff` confirm.
BASH_MUTATE_RE = re.compile(
    r"(>>?\s|\bsed\s+-i\b|\btee\b|\bgit\s+apply\b|\bgit\s+checkout\s+--|\bcp\s|\bmv\s|\bdd\s|\btruncate\b|\bpatch\b)"
)
_PROVIDER_RE = re.compile(r"\b(cascade-dispatch|hamr-client|hamr\.workers\.dev|dispatchRedTeam)\b", re.IGNORECASE)


def _bash_mutated_tracked_paths(command: str) -> list[str]:
    """#2978: when a Bash command looks mutating (cheap pre-filter), CONFIRM via a real
    `git diff --name-only HEAD` and return the tracked paths that actually changed. A read-only
    command (no pre-filter match) or any git failure returns [] — never raises, never blocks the
    hook. Cross-cwd / worktree state-isolation stays Epic #2091's scope (runs in the hook's cwd).
    """
    if not BASH_MUTATE_RE.search(command):
        return []
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD"],
            cwd=os.getcwd(), capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return []
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]
    except Exception:
        return []


def _repo_root() -> str | None:
    """#3266: absolute path of the tracked repo working tree, or None when unresolved.
    Runs in the hook cwd (same convention as _bash_mutated_tracked_paths). Never raises.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=os.getcwd(), capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return None
        return result.stdout.strip() or None
    except Exception:
        return None


def _path_in_repo(path: str, repo_root: str | None) -> bool:
    """#3266: True when `path` resolves INSIDE the tracked repo working tree.

    Fail-SAFE (denylist philosophy, mirrors #2978): repo_root None → True, i.e. keep
    flagging when git cannot resolve the root — a false-positive nag is safer than a
    silently-missed mutation. A path OUTSIDE the repo (scratchpad / /tmp / ~/.claude /
    any other absolute tree) returns False, so non-repo execution no longer flips a touch
    flag. Only a real in-repo file change may flip code_touched/docs_touched/etc.
    """
    if not repo_root:
        return True
    try:
        base = (os.path.normpath(path) if os.path.isabs(path)
                else os.path.normpath(os.path.join(os.getcwd(), path)))
        root = os.path.normpath(repo_root)
        return base == root or base.startswith(root + os.sep)
    except Exception:
        return True


def mark_tool_activity(state: dict[str, Any], payload: dict[str, Any]) -> None:
    """Update governance state based on tool usage."""
    tool = str(payload.get("tool_name", ""))
    values = list(iter_strings(payload.get("tool_input", {})))
    joined = "\n".join(values)
    roles = state.setdefault("roles", {})
    flags = state.setdefault("flags", {})
    ops = state.setdefault("admin_ops", {})
    blast = state.setdefault("blast_radius", {})
    blast.setdefault("files_edited_count", 0)
    blast.setdefault("push_count", 0)
    blast.setdefault("provider_call_count", 0)

    if tool in EDIT_TOOLS:
        roles["collaborator"] = True
        blast["files_edited_count"] += 1

    # #2913: session aggregate counters for sequence-level anomaly detection (G-15)
    update_session_counters(state, tool, values)

    # #1960 + #2978: derive candidate_paths ONLY from genuine mutations, never from read-only tools.
    # - Bash: explicit patch-file names (apply_patch) + paths a real `git diff` confirms changed.
    # - Non-Bash, non-read-only (mutators + UNKNOWN tools): classify inputs (fail-safe — a governance
    #   gate must not silently miss a mutation, so unknown tools still flip).
    # - READ_ONLY_TOOLS (Read/Grep/Glob/...): skipped entirely → no false code_touched (the #2978 fix).
    candidate_paths: list[str] = []
    if tool in BASH_TOOLS:
        for value in values:
            if "***" in value and "File:" in value:
                candidate_paths.extend(m.strip() for m in PATCH_FILE_RE.findall(value))
        candidate_paths.extend(_bash_mutated_tracked_paths(joined))
    elif tool not in READ_ONLY_TOOLS:
        for value in values:
            candidate_paths.append(value)
            if "***" in value and "File:" in value:
                candidate_paths.extend(m.strip() for m in PATCH_FILE_RE.findall(value))

    # #3266: resolve the repo root ONCE (only when there is something to classify) so a
    # scratchpad / non-repo write cannot flip a touch flag. Read-only tools leave
    # candidate_paths empty, so no git call is made for them.
    repo_root = _repo_root() if candidate_paths else None
    for value in candidate_paths:
        if "/" not in value and "." not in value:
            continue
        if not _path_in_repo(value, repo_root):
            continue  # #3266: mutation outside the tracked repo — nothing to merge, do not flag
        kind = classify_path(value)
        if kind == "docs":
            flags["docs_touched"] = True
        elif kind == "extension":
            flags["extension_touched"] = True
            flags["code_touched"] = True
            roles["collaborator"] = True
        elif kind == "ui":  # #1817: scope visual_qa to actual UI paths
            flags["ui_touched"] = True
            flags["code_touched"] = True
            roles["collaborator"] = True
        elif kind == "code":
            flags["code_touched"] = True
            roles["collaborator"] = True

    if tool not in BASH_TOOLS:
        return

    _match_ops = [
        (RE_VSCE_SHOW, "version_check"),
        (RE_GIT_COMMIT, "commit"),
        (RE_GIT_PUSH, "push"),
        (RE_PR_CREATE, "pr_create"),
        (RE_PR_CHECKS, "ci_green"),
        (RE_PR_MERGE, "merge"),
        (RE_VSCE_PUBLISH, "publish"),
        (RE_RELEASE_INTEGRITY, "release_integrity"),
        (RE_GH_RELEASE_CREATE, "gh_release"),
        (RE_GH_ISSUE_CLOSE, "issue_close"),
        (RE_GH_ISSUE_CREATE, "issue_linked"),
    ]
    for pattern, key in _match_ops:
        if pattern.search(joined):
            ops[key] = True
    # #3265: count only genuine, successful code-shipping pushes — not
    # branch-deletes, dry-runs, or pushes the pre-push gate rejected.
    if is_countable_push(joined, payload.get("tool_response")):
        blast["push_count"] += 1
    if _PROVIDER_RE.search(joined):
        blast["provider_call_count"] += 1

    # #2444: auto-emit roles.admin once all required ops complete.
    # Mirrors check_admin_ops base/ext logic via shared helper.
    repo_type = state.get("repo_type", "generic")
    required = required_admin_ops(flags, repo_type)
    if required and all(ops.get(k) for k in required):
        if not roles.get("admin"):
            # #2457: emit baton-event on role transition
            try:
                import re as _re
                branch = state.get("active_branch") or ""
                m = _re.match(r"^[a-z]+/(\d+)-", branch)
                if m:
                    emit_role_handoff("collaborator", "admin", int(m.group(1)))
            except Exception:
                pass  # never break the gate on emitter failure
        roles["admin"] = True
    # #2918: detect baton artifact posts in Bash inputs and emit decision events
    if tool in BASH_TOOLS:
        artifact_match = _BATON_ARTIFACT_RE.search(joined)
        if artifact_match:
            artifact_name = artifact_match.group(1)
            role, decision_type = _BATON_ROLE_MAP.get(
                artifact_name, ("unknown", "baton.artifact")
            )
            try:
                from baton_event_emitter import emit_decision
                ticket = state.get("active_ticket")
                emit_decision(role, decision_type, "posted", ticket=ticket,
                              input_summary=f"{artifact_name} posted on #{ticket}")
            except Exception:
                pass  # G6: never break activity tracking
            if artifact_name == "MANAGER_HANDOFF":
                state["current_phase"] = "ready"