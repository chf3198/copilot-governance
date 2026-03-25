#!/usr/bin/env python3
import json
import re
import sys
from typing import Any, Iterable

SECRET_FILE_RE = re.compile(r"(^|/)(\.env(\..*)?|id_rsa|id_ed25519|.*\.pem|.*\.key)$")
DANGEROUS_CMD_RE = re.compile(r"\brm\s+-rf\s+/(\s|$)|\bmkfs\b|\bdd\s+if=|\bDROP\s+TABLE\b", re.IGNORECASE)


def iter_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from iter_strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from iter_strings(v)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool = str(payload.get("tool_name", ""))
    tool_input = payload.get("tool_input", {})
    values = list(iter_strings(tool_input))

    if tool in {"run_in_terminal", "terminal", "runTerminalCommand"}:
        joined = "\n".join(values)
        if DANGEROUS_CMD_RE.search(joined):
            out = {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": "Blocked dangerous terminal command by global policy.",
                }
            }
            print(json.dumps(out))
            return 0

    suspicious_paths = [v for v in values if "/" in v or "." in v]
    if any(SECRET_FILE_RE.search(p) and not p.endswith(".env.example") for p in suspicious_paths):
        out = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "ask",
                "permissionDecisionReason": "Sensitive file path detected (.env/key material). Manual approval required.",
                "additionalContext": "Use secret-safe patterns and avoid committing or packaging sensitive files.",
            }
        }
        print(json.dumps(out))
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
