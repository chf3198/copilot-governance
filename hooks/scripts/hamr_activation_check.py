#!/usr/bin/env python3
"""SessionStart hook: warn when HAMR activation is absent, stale, or disabled.

Runtime support: claude, copilot, codex, cursor, antigravity.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

MAX_AGE = timedelta(hours=24)


def candidate_paths() -> list[Path]:
    override = os.getenv("HAMR_CONFIG_PATH")
    if override:
        return [Path(override).expanduser()]
    home = Path.home()
    paths = {
        "claude": home / ".claude" / "hamr-config.json",
        "copilot": home / ".copilot" / "hamr-config.json",
        "codex": home / ".codex" / "devenv-ops" / "hamr-config.json",
        "cursor": home / ".cursor" / "hamr-config.json",
        "antigravity": home / ".gemini" / "antigravity" / "hamr-config.json",
    }
    runtime = (os.getenv("DEVENT_OPS_RUNTIME") or os.getenv("HAMR_TEAM") or "copilot").lower()
    order = [runtime, "copilot", "claude", "codex", "cursor", "antigravity"]
    return [paths[name] for name in dict.fromkeys(order) if name in paths]


def read_config() -> tuple[Path | None, dict]:
    for path in candidate_paths():
        if not path.exists():
            continue
        try:
            return path, json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return path, {"enabled": False, "error": "malformed"}
    return None, {}


def parse_time(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except ValueError:
        return None


def activation_message(now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    path, cfg = read_config()
    if not path:
        return "HAMR activation warning: no hamr-config.json found; run npm run hamr:activate before governed provider calls."
    if cfg.get("enabled") is not True:
        return f"HAMR activation warning: disabled or invalid config at {path}."
    activated = parse_time(str(cfg.get("activated_at") or ""))
    if not activated:
        return f"HAMR activation warning: missing activated_at in {path}."
    if now - activated > MAX_AGE:
        return f"HAMR activation warning: stale activation at {path}; refresh with npm run hamr:activate."
    return f"HAMR activation fresh: {path}."


def main() -> int:
    try:
        json.load(sys.stdin)
    except Exception:
        pass
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": activation_message(),
        }
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
