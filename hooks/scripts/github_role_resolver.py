"""GitHub-derived role state resolver for baton state authority (#2456).

Move 1 of Epic #2451: collapse local roles dict in favor of GitHub-as-source.
Queries `gh issue view N --json labels,comments` with 60s TTL cache.

Feature-flagged via env MEGINGJORD_DERIVE_ROLES_FROM_GH. When off, returns None
and callers fall back to legacy local-state reads.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from typing import Optional

CACHE_TTL_SECONDS = 60
MAX_STALE_SECONDS = 90  # G6: bound stale role cache (#3034 C6)
_cache: dict[int, tuple[float, dict]] = {}
_cache_lock = threading.Lock()

ROLE_LABELS = {
    "role:manager": "manager",
    "role:collaborator": "collaborator",
    "role:admin": "admin",
    "role:consultant": "consultant",
}


def feature_enabled() -> bool:
    """Resolver disabled by default; enable via env for gradual rollout."""
    return os.environ.get("MEGINGJORD_DERIVE_ROLES_FROM_GH", "").strip() == "1"


def _empty_roles() -> dict:
    return {"manager": False, "collaborator": False, "admin": False, "consultant": False}



def _warn_degraded(reason: str, ticket_n: int) -> None:
    """G8 observability: emit user-visible degradation note to stderr (#2460)."""
    if os.environ.get("MEGINGJORD_QUIET_RESOLVER", "").strip() == "1":
        return
    sys.stderr.write(
        f"[role-resolver] degraded: {reason} for #{ticket_n}; "
        f"falling back to {'stale cache' if reason != 'cold-miss' else 'local-state'}\n"
    )

def _gh_view(ticket_n: int, timeout: float = 10.0) -> Optional[dict]:
    """Call gh CLI; return parsed JSON or None on failure (G6 fallback)."""
    try:
        result = subprocess.run(
            ["gh", "issue", "view", str(ticket_n), "--json", "labels,comments"],
            capture_output=True, text=True, timeout=timeout, check=False,
        )
        if result.returncode != 0:
            return None
        return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError, OSError):
        return None


def _parse_roles(issue: dict) -> dict:
    """Project issue labels to canonical role-state dict."""
    roles = _empty_roles()
    labels = {lbl.get("name", "") for lbl in issue.get("labels", [])}
    for label, key in ROLE_LABELS.items():
        if label in labels:
            roles[key] = True
    return roles


def derive_roles_from_github(ticket_n: int) -> Optional[dict]:
    """Return roles dict derived from GitHub, or None if feature disabled / offline.

    Cached with 60s TTL (thread-safe via _cache_lock). Returns stale cache up to
    MAX_STALE_SECONDS old if fresh fetch fails (G6 resilience with bounded staleness).
    """
    if not feature_enabled() or not ticket_n:
        return None

    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(ticket_n)
        if cached and (now - cached[0]) < CACHE_TTL_SECONDS:
            return cached[1]

    issue = _gh_view(ticket_n)
    if issue is None:
        # G6 with bound: serve stale only if within MAX_STALE_SECONDS
        if cached and (now - cached[0]) < MAX_STALE_SECONDS:
            _warn_degraded("gh-fetch-failed-using-stale", ticket_n)
            return cached[1]
        _warn_degraded("cold-miss", ticket_n)
        return None

    roles = _parse_roles(issue)
    with _cache_lock:
        _cache[ticket_n] = (now, roles)
    return roles


def clear_cache() -> None:
    """Test helper: drop TTL cache."""
    _cache.clear()
