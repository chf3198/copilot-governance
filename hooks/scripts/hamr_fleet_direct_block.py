"""HAMR fleet-direct-block — env-gated enforcement for pretool_guard.

Refs Epic #2029 #2236 wiring follow-on. Python mirror of
scripts/global/hamr-fleet-direct-block.js (#2219). Consumes #2235
detect_bypass output; returns block decision when
MEGINGJORD_FLEET_DIRECT_BLOCK=1 AND severity='fleet-bypass'.
"""

from __future__ import annotations

import os
import re

ENV_FLAG = "MEGINGJORD_FLEET_DIRECT_BLOCK"
# #2933 (Epic #2926 C7): review-context anti-bypass for raw cross-family-provider calls.
REVIEW_BYPASS_BLOCK_FLAG = "MEGINGJORD_REVIEW_BYPASS_BLOCK"
REVIEW_CTX_RE = re.compile(
    r"\b(review|critique|rubric|red.?team|adversarial|second.?opinion|cross.?family)\b", re.I
)
REVIEW_REDIRECT_MSG = (
    "Raw cross-family-provider call in a review context. Use "
    "scripts/global/cascade-dispatch.js (Epic #2926 C1) for the $0-default review "
    "cascade instead of a raw paid call."
)
REDIRECT_MSG = (
    "Direct fleet call blocked. Use scripts/global/fleet-red-team-dispatch.js "
    "(Epic #2041 #2175) for HAMR-routed dispatch via tier=fleet-local."
)


def is_enabled(env=None):
    env = env if env is not None else os.environ
    return env.get(ENV_FLAG) == "1"


def should_block(detection, env=None):
    if not is_enabled(env):
        return {"block": False, "reason": "env-flag-off"}
    if not detection or not detection.get("detected"):
        return {"block": False, "reason": "no-bypass-detected"}
    if detection.get("suppressed"):
        return {"block": False, "reason": "override-marker-suppresses"}
    if detection.get("severity") == "fleet-bypass":
        return {"block": True, "reason": "fleet-direct-blocked", "message": REDIRECT_MSG}
    if detection.get("severity") == "paid-bypass":
        return {"block": False, "reason": "paid-bypass-not-fleet-scope"}
    return {"block": False, "reason": "unknown-severity"}


def block_message(detection):
    providers = ", ".join(p["name"] for p in (detection or {}).get("providers", [])) or "unknown"
    return f"{REDIRECT_MSG} (detected providers: {providers})"


def is_review_context(cmd_string, env=None):
    """#2933 C7: is this command running in a review/critique context?"""
    env = env if env is not None else os.environ
    if env.get("MEGINGJORD_REVIEW_CONTEXT") == "1":
        return True
    return bool(REVIEW_CTX_RE.search(cmd_string or ""))


def _provider_names(detection):
    out = []
    for p in (detection or {}).get("providers", []):
        out.append(p["name"] if isinstance(p, dict) else p)
    return out


def review_bypass_decision(detection, cmd_string, env=None):
    """#2933 C7: flag a raw cross-family-provider (paid) call in a review context.

    Advisory by default (soak); DENY when MEGINGJORD_REVIEW_BYPASS_BLOCK=1. Only acts on
    severity='paid-bypass' (gemini/openai etc.) — fleet-bypass stays should_block's job, and a
    suppressed override-marker is honored.

    Scope/limitations (deliberate, per #2933 cross-family review):
    - Detection is regex-based (inherits detect_bypass's URL patterns); an obfuscated/base64 URL can
      evade it. Acceptable for an ADVISORY soak gate — it nudges, it is not a hard security boundary.
    - It does NOT block a legitimate high-stakes premium review: that path is cascade-dispatch.js
      (which routes high-stakes to gemini-pro via the C5 stakes-router), NOT a raw curl. So flagging
      raw paid curls steers toward the governed path rather than blocking real review work.
    """
    env = env if env is not None else os.environ
    if not detection or not detection.get("detected") or detection.get("suppressed"):
        return {"flag": False, "block": False, "reason": "no-bypass-or-suppressed"}
    if detection.get("severity") != "paid-bypass":
        return {"flag": False, "block": False, "reason": "not-paid-provider"}
    if not is_review_context(cmd_string, env):
        return {"flag": False, "block": False, "reason": "not-review-context"}
    blocking = env.get(REVIEW_BYPASS_BLOCK_FLAG) == "1"
    return {
        "flag": True,
        "block": blocking,
        "advisory": not blocking,
        "reason": "review-paid-bypass-blocked" if blocking else "review-paid-bypass-advisory",
        "message": REVIEW_REDIRECT_MSG,
        "providers": _provider_names(detection),
    }
