#!/usr/bin/env python3
import json
import re
import sys
from typing import Any, Iterable

DOC_TRIGGER_RE = re.compile(r"(^|/)(README\.md|CHANGELOG\.md|docs/|\.github/workflows/|package\.json|pyproject\.toml|Cargo\.toml|pom\.xml|\.vscodeignore)$")


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

    tool_input = payload.get("tool_input", {})
    values = list(iter_strings(tool_input))

    if any(DOC_TRIGGER_RE.search(v) for v in values):
        out = {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": (
                    "Standards reminder: validate version integrity, run relevant checks, "
                    "audit distributable artifacts for secret files, and sync docs to behavior/config changes."
                ),
            },
            "systemMessage": "Global standards reminder injected after sensitive file/workflow edit."
        }
        print(json.dumps(out))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
