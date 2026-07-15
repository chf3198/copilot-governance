"""HAMR merge-claim client with GitHub-label fallback (#2458 #2479).

Phase-1 Move 3: HAMR-backed merge serialization.
GitHub-label fallback (Tier-1): used when MEGINGJORD_HAMR_DISABLED=1 or HAMR
unreachable. Label format: merge-claim:held:<team>. Refs #2479.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

sys.path.insert(0, os.path.dirname(__file__))  # #2770 hydrate .env before any credential read
try:
    from load_local_env import load_local_env_once
    load_local_env_once()
except Exception:
    pass  # graceful: hydration must never break the hook (G6)

HAMR_BASE = os.environ.get("HAMR_BASE_URL", "https://hamr.chf3198.workers.dev")
DEFAULT_TEAM = os.environ.get("HAMR_TEAM", "claude-code")
TIMEOUT_S = 10
SENTINEL_CLAIM_FEATURE_OFF = "feature-off"
SENTINEL_CLAIM_GH_PREFIX = "gh-label"
GH_LABEL_PREFIX = "merge-claim:held:"


def feature_enabled() -> bool:
    return os.environ.get("MEGINGJORD_MERGE_CLAIM", "").strip() == "1"


def _hamr_disabled() -> bool:
    return os.environ.get("MEGINGJORD_HAMR_DISABLED", "").strip() == "1"


def _gh_api(method: str, path: str, body: Optional[dict] = None) -> Optional[dict]:
    token = os.environ.get("GITHUB_TOKEN", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not token or not repo:
        return None
    url = f"https://api.github.com/repos/{repo}{path}"
    data = json.dumps(body).encode() if body else None
    hdrs: dict = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if data:
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        if e.code in (204, 404):
            return {}
        try:
            return json.loads(e.read())
        except Exception:
            return {"error": f"http_{e.code}"}
    except (urllib.error.URLError, OSError, json.JSONDecodeError):
        return None


def _gh_acquire(ticket_n: int, team: str) -> Optional[dict]:
    label = f"{GH_LABEL_PREFIX}{team}"
    _gh_api("POST", "/labels", {"name": label, "color": "e11d48"})
    result = _gh_api("POST", f"/issues/{ticket_n}/labels", {"labels": [label]})
    if result is None:
        return None
    claim_id = f"{SENTINEL_CLAIM_GH_PREFIX}:{ticket_n}:{team}"
    return {"claim_id": claim_id, "ttl_s": 300, "mode": "gh-label"}


def _gh_release(ticket_n: int, team: str) -> Optional[dict]:
    label = urllib.parse.quote(f"{GH_LABEL_PREFIX}{team}", safe="")
    result = _gh_api("DELETE", f"/issues/{ticket_n}/labels/{label}")
    return {"released": True, "mode": "gh-label"} if result is not None else None


def _gh_status(ticket_n: int) -> Optional[dict]:
    result = _gh_api("GET", f"/issues/{ticket_n}/labels")
    if result is None:
        return None
    labels = [lbl["name"] for lbl in (result if isinstance(result, list) else [])
              if lbl.get("name", "").startswith(GH_LABEL_PREFIX)]
    return {"held": bool(labels), "labels": labels, "mode": "gh-label"}


def _post(path: str, headers: dict, body: bytes = b"") -> Optional[dict]:
    url = f"{HAMR_BASE}{path}"
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read())
        except Exception:
            return {"error": f"http_{e.code}"}
    except (urllib.error.URLError, OSError, json.JSONDecodeError):
        return None  # G6: caller decides degrade behavior


def _get(path: str) -> Optional[dict]:
    url = f"{HAMR_BASE}{path}"
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, OSError, json.JSONDecodeError):
        return None


def _auth_headers(team: str) -> dict:
    token = os.environ.get("HAMR_DPOP_TOKEN", "stub")
    return {
        "authorization": f"DPoP {token}",
        "x-hamr-team": team,
        "content-type": "application/json",
    }


def acquire(ticket_n: int, team: Optional[str] = None) -> Optional[dict]:
    """Acquire merge-claim. HAMR primary, GitHub-label fallback (G5/G6)."""
    if not feature_enabled():
        return {"claim_id": SENTINEL_CLAIM_FEATURE_OFF, "ttl_s": 0}
    t = team or DEFAULT_TEAM
    if not _hamr_disabled():
        result = _post(f"/merge-claim/acquire/{ticket_n}", _auth_headers(t))
        if result is not None:
            return result
    return _gh_acquire(ticket_n, t)


def release(claim_id: str, team: Optional[str] = None) -> Optional[dict]:
    """Release a claim. Handles HAMR, GitHub-label, and sentinel forms."""
    if claim_id == SENTINEL_CLAIM_FEATURE_OFF or not feature_enabled():
        return {"released": True, "noop": True}
    if claim_id.startswith(f"{SENTINEL_CLAIM_GH_PREFIX}:"):
        parts = claim_id.split(":", 2)
        t = parts[2] if len(parts) > 2 else (team or DEFAULT_TEAM)
        return _gh_release(int(parts[1]), t)
    return _post(f"/merge-claim/release/{claim_id}", _auth_headers(team or DEFAULT_TEAM))


def status(ticket_n: int) -> Optional[dict]:
    """Query current claim status; GH-label fallback when HAMR disabled."""
    if not feature_enabled():
        return {"held": False, "feature_off": True}
    if not _hamr_disabled():
        result = _get(f"/merge-claim/status/{ticket_n}")
        if result is not None:
            return result
    return _gh_status(ticket_n)
