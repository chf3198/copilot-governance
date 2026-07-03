#!/usr/bin/env python3
"""Route context message builder and fleet cascade runner for userprompt_gate."""

from task_router import execute_cascade

_FLEET_SUCCESS = (
    "FLEET EXECUTED (local Ollama, $0 cost): response attached above. "
    "Incorporate it — do not re-generate at frontier tier."
)
_FLEET_ESCALATE = (
    "FLEET ROUTING REQUIRED: lane={lane}. Local tier insufficient ({reason}). "
    "Use {tier} tier. Avoid Sonnet unless {tier} is also inadequate."
)


def run_fleet_cascade(prompt: str, state: dict) -> dict:
    """Call cascade-dispatch and persist summary to state. Returns result dict."""
    result = execute_cascade(prompt)
    state.setdefault("routing", {})["cascade_result"] = {
        "tier": result.get("tier"),
        "confidence": result.get("confidence"),
        "escalation_needed": result.get("escalation_needed"),
        "reason": result.get("reason") or result.get("quality_reason"),
    }
    return result


def build_route_context(route: dict, cascade_result: dict | None) -> str:
    """Build the additionalContext string for a routing decision."""
    lane = route.get("lane", "free")
    base = (
        f"Task router: lane={lane}, backend={route.get('backend','auto')}, "
        f"model={route.get('recommendedModel','Auto')}, "
        f"confidence={route.get('confidence','medium')}."
    )
    if lane != "fleet" or cascade_result is None:
        return base

    if cascade_result.get("ok") and not cascade_result.get("escalation_needed"):
        return f"{base} {_FLEET_SUCCESS}"

    reason = cascade_result.get("reason") or cascade_result.get("quality_reason", "low_confidence")
    tier = cascade_result.get("suggested_tier", "haiku")
    return base + " " + _FLEET_ESCALATE.format(lane=lane, reason=reason, tier=tier)
