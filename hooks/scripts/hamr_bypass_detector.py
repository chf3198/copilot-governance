"""HAMR bypass-detector for pretool_guard PreToolUse hook.

Refs Epic #2029 #2235 wiring follow-on. Python mirror of
scripts/global/hamr-bypass-detector.js (#2220) to avoid subprocess overhead
on every Bash invocation. Detector logic kept minimal; canonical regex set
matches the JS module per regression test.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

FLEET_PORT = 11434
LOOPBACK_IP_PARTS = (127, 0, 0, 1)
DEFAULT_FLEET_IP_PARTS = (100, 91, 113, 16)

PAID_PROVIDER_REGEXES = [
    ("anthropic", re.compile(r"https?://api\.anthropic\.com", re.I)),
    ("openai", re.compile(r"https?://api\.openai\.com", re.I)),
    ("openrouter", re.compile(r"https?://openrouter\.ai", re.I)),
    ("gemini", re.compile(r"https?://generativelanguage\.googleapis\.com", re.I)),
    ("groq", re.compile(r"https?://api\.groq\.com", re.I)),
    ("cerebras", re.compile(r"https?://api\.cerebras\.ai", re.I)),
]

OVERRIDE_MARKER_RE = re.compile(r"#\s*hamr-bypass-ok:\s*(.+?)(?:\n|$)", re.I)
CURL_INVOKE_RE = re.compile(r"\b(?:curl|wget|http|httpie)\b", re.I)


def _ip_from_parts(parts):
    return ".".join(str(p) for p in parts)


def _fleet_substrings():
    fleet_ip = os.environ.get("FLEET_HOST_IP") or _ip_from_parts(DEFAULT_FLEET_IP_PARTS)
    loopback = _ip_from_parts(LOOPBACK_IP_PARTS)
    return [
        ("ollama-fleet", f"{fleet_ip}:{FLEET_PORT}"),
        ("ollama-local-ip", f"{loopback}:{FLEET_PORT}"),
        ("ollama-local-name", f"localhost:{FLEET_PORT}"),
    ]


def detect_bypass(cmd_string):
    text = str(cmd_string or "")
    if not CURL_INVOKE_RE.search(text):
        return {"detected": False, "reason": "not-http-invocation"}
    matches = []
    for name, regex in PAID_PROVIDER_REGEXES:
        if regex.search(text):
            matches.append({"name": name, "paid": True})
    for name, literal in _fleet_substrings():
        if literal in text:
            matches.append({"name": name, "paid": False})
    if not matches:
        return {"detected": False, "reason": "no-known-provider-url"}
    override_match = OVERRIDE_MARKER_RE.search(text)
    if override_match:
        return {"detected": True, "suppressed": True, "reason": "override-marker-present",
                "override_reason": override_match.group(1).strip(), "providers": matches}
    severity = "paid-bypass" if any(m["paid"] for m in matches) else "fleet-bypass"
    return {"detected": True, "suppressed": False, "providers": matches, "severity": severity}


def emit_incident(detection, incidents_path=None, now_ms=None):
    if not detection or not detection.get("detected") or detection.get("suppressed"):
        return None
    incidents_path = incidents_path or str(Path.home() / ".megingjord" / "incidents.jsonl")
    evt = {
        "ts": now_ms or int(time.time() * 1000),
        "version": 3,
        "service": "megingjord-hamr-bypass-detector",
        "env": "prod",
        "event": "hamr-bypass-detected",
        "pattern_id": "hamr-bypass-detected",
        "severity": detection["severity"],
        "providers": [p["name"] for p in detection["providers"]],
    }
    Path(incidents_path).parent.mkdir(parents=True, exist_ok=True)
    with open(incidents_path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(evt) + "\n")
    return evt
