#!/usr/bin/env python3
"""stuck_state_gate.py — Stop hook (#3766): live wiring of the #3748 stuck-state detector.

Reads the Stop-event payload, derives the available behavioral signals, and delegates detection +
carve-out routing to the shipped ADVISORY detector via the Node bridge (stuck-state-hook-bridge.js,
which reuses adjudication-guardrail.classifyDecision). On a detected stuck-state it emits guidance to
route into the cross-model adjudication panel WITHOUT a client prompt (an irreversible/high-destructive
gate still escalates via `human-carveout`); it NEVER blocks and ALWAYS returns 0, independent of
replay-eval promotion state (blocking deferred per the #3748 panel). Isolated from stop_reminder.py.
Companion to client_arbitration_guard.py (#3749): that guards client-defer *language*; this guards
*behavioral* stuck-state signals. Cross-runtime (~/.claude, ~/.copilot, ~/.codex).
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = os.environ.get("MEGINGJORD_REPO_ROOT", os.path.expanduser("~/devenv-ops"))
_HOOK_DIR = Path(__file__).resolve().parent
# Resolve the bridge both in-checkout (REPO_ROOT/scripts/global) and deployed
# (~/.copilot/hooks/scripts -> ~/.copilot/scripts/global), preferring whichever exists.
_BRIDGE_CANDIDATES = [
    os.path.join(REPO_ROOT, "scripts", "global", "stuck-state-hook-bridge.js"),
    str(_HOOK_DIR.parent.parent / "scripts" / "global" / "stuck-state-hook-bridge.js"),
]
EVENTS = os.environ.get("MEGINGJORD_STUCK_EVENTS", str(Path.home() / ".megingjord" / "stuck-state-events.jsonl"))

# Explicit behavioral markers in the assistant's stop text -> the detector's explicit-signal enum.
_MARKERS = (
    ("ambiguous-gate", re.compile(r"\b(ambiguous gate|unclear (?:gate|requirement)|which option should)\b", re.I)),
    ("novel-failure", re.compile(r"\b(novel failure|never seen|unfamiliar error|no known fix)\b", re.I)),
    ("stuck-pr", re.compile(r"\b(stuck|going in circles|can'?t proceed|keep failing|same error again)\b", re.I)),
)


def _assistant_text(payload: dict) -> str:
    for key in ("assistant_response", "response", "output", "final_response", "message"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return ""


def derive_signals(payload: dict) -> dict:
    """Best-effort signal bundle: a runtime may pre-compute counters under `stuck_signals`; else derive
    an explicit signal from the assistant text. Never raises.
    """
    signals = {}
    pre = payload.get("stuck_signals")
    if isinstance(pre, dict):
        signals.update(pre)
    if not signals.get("explicit"):
        text = _assistant_text(payload)
        for name, rx in _MARKERS:
            if rx.search(text):
                signals["explicit"] = name
                break
    return signals


def emit_event(result: dict) -> None:
    """Append a schema-v3 G8 observability event. Best-effort; never raises."""
    event = {
        "version": 3, "ts": datetime.now(timezone.utc).isoformat(),
        "service": "stop-hook-stuck-state-gate", "env": "local", "trigger_role": "system",
        "event": "governance.stuck_state_detected", "advisory": True,
        "triggers": result.get("triggers", []), "route": result.get("route"),
        "_summary": f"stuck-state {result.get('route')} via {','.join(result.get('triggers', [])) or 'n/a'}",
    }
    try:
        p = Path(EVENTS)
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(event) + "\n")
    except OSError:
        pass


def run_bridge(signals: dict) -> dict:
    """Invoke the Node bridge. Fail-safe: {} on any error / missing node / missing bridge."""
    bridge = next((c for c in _BRIDGE_CANDIDATES if os.path.exists(c)), None)
    if not bridge:
        return {}
    try:
        proc = subprocess.run(["node", bridge], input=json.dumps(signals),
                              capture_output=True, text=True, timeout=8)
        return json.loads(proc.stdout or "{}")
    except (subprocess.SubprocessError, OSError, json.JSONDecodeError):
        return {}


def main() -> int:
    raw = sys.stdin.read() if not sys.stdin.isatty() else ""
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        payload = {}
    if payload.get("stop_hook_active"):
        return 0
    result = run_bridge(derive_signals(payload))
    if not result.get("detected"):
        return 0
    emit_event(result)
    triggers = ", ".join(result.get("triggers", [])) or "unknown"
    if result.get("route") == "human-carveout":
        sys.stderr.write(
            f"\n⚠ STUCK-STATE ({triggers}) → human-carveout [{result.get('tier')}]: a genuinely "
            "irreversible / security-weakening gate — escalate to the client per the 4 retained "
            "touchpoints. This is the ONLY sanctioned escalation.\n")
    else:
        sys.stderr.write(
            f"\n⚠ STUCK-STATE ({triggers}) → {result.get('route')} (ADVISORY): resolve autonomously via "
            "adjudication-guardrail.decide() (free cross-model panel) — do NOT defer the decision to the "
            "client (operator-identity rule 2/3).\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
