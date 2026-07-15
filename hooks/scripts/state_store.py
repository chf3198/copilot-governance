#!/usr/bin/env python3
"""Governance state persistence: load, save, ensure, reset."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from repo_detection import detect_repo_type
from runtime_paths import state_root

STATE_ROOT = state_root()


def _repo_key(cwd: str) -> str:
    return hashlib.sha1(cwd.encode("utf-8")).hexdigest()[:16]


def _session_short() -> str:
    env = os.environ.get("MEGINGJORD_SESSION_ID", "").strip()
    if env:
        return env[:8]
    sid_file = Path.home() / ".megingjord" / "session.id"
    return sid_file.read_text(encoding="utf-8").strip()[:8] if sid_file.exists() else "nosession"


def state_path(cwd: str) -> Path:
    return state_root() / f"repo-{_repo_key(cwd)}-{_session_short()}.json"


def _default_state(cwd: str) -> dict[str, Any]:
    return {"cwd": cwd, "repo_type": detect_repo_type(cwd),
        "routing": {"lane": "free", "backend": "auto", "recommended_model": "Auto",
            "confidence": "medium", "rationale": "default"},
        "current_phase": "manager", "active_branch": None,
        "roles": {"manager": False, "collaborator": False, "admin": False, "consultant": False},
        "flags": {"code_touched": False, "docs_touched": False, "extension_touched": False, "ui_touched": False},
        "admin_ops": {"version_check": False, "commit": False, "push": False, "pr_create": False,
            "ci_green": False, "merge": False, "publish": False, "release_integrity": False,
            "gh_release": False, "issue_close": False, "issue_linked": False, "visual_qa": False},
        "blast_radius": {"files_edited_count": 0, "push_count": 0, "provider_call_count": 0},
        "drift": {"commits": 0, "commits_with_ticket": 0, "branches": 0,
            "branches_compliant": 0, "edits_gated": 0, "edits_ungated": 0}}

def load_state(cwd: str) -> dict[str, Any]:
    path = state_path(cwd)
    if not path.exists():
        return _default_state(cwd)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _default_state(cwd)
        defaults, keys = _default_state(cwd), ("routing", "roles", "flags", "admin_ops", "blast_radius", "drift")
        data.setdefault("cwd", cwd)
        data.setdefault("repo_type", detect_repo_type(cwd))
        data.setdefault("current_phase", defaults["current_phase"])
        data.setdefault("active_branch", None)
        for key in keys:
            if key not in data:
                data[key] = defaults[key]
            elif isinstance(defaults[key], dict):
                for sk, sv in defaults[key].items():
                    data[key].setdefault(sk, sv)
        return data
    except Exception:
        return _default_state(cwd)


def save_state(state: dict[str, Any]) -> None:
    cwd = str(state.get("cwd") or os.getcwd())
    path = state_path(cwd)
    from atomic_io import atomic_write_json
    atomic_write_json(path, state)


def ensure_state(cwd: str) -> dict[str, Any]:
    state = load_state(cwd)
    if state.get("cwd") != cwd:
        state = _default_state(cwd)
    state["repo_type"] = detect_repo_type(cwd)
    save_state(state)
    return state


def reset_state(cwd: str) -> dict[str, Any]:
    state = _default_state(cwd)
    save_state(state)
    return state

def reset_on_branch_change(cwd: str, current_branch: str | None) -> dict[str, Any]:
    """Reset transient state on branch change; preserve routing + drift (#1975)."""
    state = load_state(cwd)
    if current_branch and state.get("active_branch") != current_branch:
        defaults = _default_state(cwd)
        # #3469: a rebase / cwd-churn (branch movement, not a real switch) must not wipe the
        # Admin commit signal when a linked worktree still holds a genuine commit ahead of
        # base. Preserve admin_ops.commit ONLY on that real-git evidence (fail-safe: no
        # preservation on import/lookup error; all other #1975 reset behavior is unchanged).
        preserve_commit = bool((state.get("admin_ops") or {}).get("commit"))
        if preserve_commit:
            try:
                from worktree_push_gate import any_worktree_commit_ahead
                preserve_commit = any_worktree_commit_ahead(cwd)
            except Exception:
                preserve_commit = False
        for k in ("roles", "flags", "admin_ops"):
            state[k] = defaults[k]
        if preserve_commit:
            state["admin_ops"]["commit"] = True
        state["current_phase"] = defaults["current_phase"]
        state["active_branch"] = current_branch
        save_state(state)
    return state
