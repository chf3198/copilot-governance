"""HAMR fleet-claim client (#2525). Tier-1 GitHub-label fallback when HAMR disabled."""
from __future__ import annotations
import json, os, subprocess, sys, urllib.error, urllib.request
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "hooks", "scripts"))
try:  # #2770 hydrate .env before any credential read (parity shim lives in hooks/scripts)
    from load_local_env import load_local_env_once
    load_local_env_once()
except Exception:
    pass  # graceful: hydration must never break the client (G6)

HAMR_BASE = os.environ.get("HAMR_BASE_URL", "https://hamr.chf3198.workers.dev")
DEFAULT_TEAM = os.environ.get("HAMR_TEAM", "claude-code")
TIMEOUT_S = 10
SENTINEL_FLEET_OFF = "fleet-claim-feature-off"
LABEL_PREFIX = "fleet-holding:"


def feature_enabled() -> bool:
    return os.environ.get("MEGINGJORD_FLEET_CLAIM", "").strip() == "1"


def _post(path: str, headers: dict, body: bytes = b"") -> Optional[dict]:
    try:
        req = urllib.request.Request(f"{HAMR_BASE}{path}", data=body, method="POST", headers=headers)
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try: return json.loads(e.read())
        except Exception: return {"error": f"http_{e.code}"}
    except (urllib.error.URLError, OSError, json.JSONDecodeError):
        return None


def _get(path: str) -> Optional[dict]:
    try:
        with urllib.request.urlopen(f"{HAMR_BASE}{path}", timeout=TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, OSError, json.JSONDecodeError):
        return None


def _auth(team: str) -> dict:
    return {"authorization": f"DPoP {os.environ.get('HAMR_DPOP_TOKEN', 'stub')}",
            "x-hamr-team": team, "content-type": "application/json"}


def acquire(host: str, model: str, ticket: Optional[int] = None,
            team: Optional[str] = None) -> Optional[dict]:
    if not feature_enabled():
        return {"claim_id": SENTINEL_FLEET_OFF, "ttl_s": 0}
    key = f"{host}:{model}".replace("/", "_")
    body = json.dumps({"ticket": ticket}).encode()
    return _post(f"/fleet/acquire/{key}", _auth(team or DEFAULT_TEAM), body)


def release(claim_id: str, team: Optional[str] = None) -> Optional[dict]:
    if claim_id == SENTINEL_FLEET_OFF or not feature_enabled():
        return {"released": True, "noop": True}
    return _post(f"/fleet/release/{claim_id}", _auth(team or DEFAULT_TEAM))


def in_flight() -> Optional[dict]:
    if not feature_enabled():
        return {"entries": [], "feature_off": True}
    return _get("/fleet/in-flight")


def github_label_acquire(repo: str, issue_n: int, host: str, model: str,
                         team: Optional[str] = None) -> Optional[dict]:
    """Tier-1 fallback: use issue label as claim primitive."""
    label = f"{LABEL_PREFIX}{host}:{model}:{team or DEFAULT_TEAM}".replace("/", "_")
    try:
        subprocess.run(["gh", "issue", "edit", str(issue_n), "--add-label", label],
                       capture_output=True, timeout=10, check=True)
        return {"claim_id": label, "ttl_s": 60, "via": "github-label"}
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
        return None
