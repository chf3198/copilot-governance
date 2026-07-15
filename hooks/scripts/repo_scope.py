#!/usr/bin/env python3
"""Repo scope controls for optional workflow enforcement."""
from __future__ import annotations

import json
from pathlib import Path

from runtime_paths import repo_scope_candidates


def _norm(path: str) -> str:
    return str(Path(path).expanduser().resolve())


def is_repo_enabled(cwd: str) -> bool:
    cur = _norm(cwd)
    fallback = False
    for cfg in repo_scope_candidates():
        try:
            data = json.loads(cfg.read_text(encoding="utf-8"))
        except Exception:
            continue
        enabled = data.get("enabled_repos", [])
        fallback = fallback or bool(data.get("default_enabled", False))
        if not isinstance(enabled, list):
            continue
        for item in enabled:
            if isinstance(item, str) and _norm(item) == cur:
                return True
    return fallback
