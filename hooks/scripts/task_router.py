#!/usr/bin/env python3
"""Task router helpers for prompt classification and cascade execution."""
import json
import subprocess
from pathlib import Path

from runtime_paths import script_candidates


def _router_candidates() -> list[Path]:
    return script_candidates("task-router.js")


def _cascade_candidates() -> list[Path]:
    return script_candidates("cascade-dispatch.js")


def classify_prompt(prompt: str) -> dict | None:
    for script in _router_candidates():
        if not script.exists():
            continue
        cmd = ["node", str(script), "classify", "--prompt", prompt, "--json"]
        try:
            out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
            data = json.loads(out)
            if isinstance(data, dict):
                return data
        except Exception:
            continue
    return None


def execute_cascade(prompt: str, model: str | None = None) -> dict:
    """Execute prompt on local fleet via cascade-dispatch. Returns result dict.

    On Ollama success with high confidence: returns content directly.
    On failure or low confidence: returns escalation_needed=True so caller
    can inform Claude Code to handle at mid/frontier tier.
    """
    for script in _cascade_candidates():
        if not script.exists():
            continue
        cmd = ["node", str(script), "--prompt", prompt, "--json"]
        if model:
            cmd += ["--model", model]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=15
            )
            data = json.loads(result.stdout) if result.stdout.strip() else {}
            if isinstance(data, dict):
                return data
        except Exception as exc:
            # #2619: availability failure (cascade subprocess errored) -> free $0 cloud, not paid haiku.
            return {"ok": False, "tier": "local", "escalation_needed": True,
                    "suggested_tier": "free-cloud", "reason": str(exc)}
    # #2619: availability failure (no cascade script) -> free $0 cloud, not paid haiku.
    return {"ok": False, "tier": "local", "escalation_needed": True,
            "suggested_tier": "free-cloud", "reason": "cascade_script_not_found"}


def apply_route(state: dict, route: dict | None) -> dict:
    if not route:
        return state
    state["routing"] = {
        "lane": route.get("lane", "free"),
        "backend": route.get("backend", "auto"),
        "recommended_model": route.get("recommendedModel", "Auto"),
        "confidence": route.get("confidence", "medium"),
        "rationale": route.get("rationale", "none"),
    }
    return state
