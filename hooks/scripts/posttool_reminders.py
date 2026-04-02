#!/usr/bin/env python3
"""PostToolUse hook: detect doc-trigger edits AND git commit/push commands.

Two independent triggers:
1. File edits to docs/config files -> standards reminder
2. Terminal commands containing 'git commit' or 'git push' -> governance checklist
"""
import json
import re
import sys
from typing import Any, Iterable

DOC_TRIGGER_RE = re.compile(
    r"(^|/)(README\.md|CHANGELOG\.md|docs/|\.github/workflows/"
    r"|package\.json|pyproject\.toml|Cargo\.toml|pom\.xml|\.vscodeignore)$"
)

GIT_COMMIT_RE = re.compile(r"\bgit\s+commit\b")
GIT_PUSH_RE = re.compile(r"\bgit\s+push\b")


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
    joined = "\n".join(values)

    messages = []

    # Trigger 1: doc/config file edits
    if any(DOC_TRIGGER_RE.search(v) for v in values):
        messages.append(
            "Standards reminder: validate version integrity, run relevant checks, "
            "audit distributable artifacts for secret files, and sync docs to "
            "behavior/config changes."
        )

    # Trigger 2: git commit or push in terminal
    if tool in {"run_in_terminal", "terminal", "runTerminalCommand"}:
        if GIT_PUSH_RE.search(joined):
            messages.append(
                "Pre-push governance gate: have you run "
                "scripts/docs-integrity-check.sh? The pre-push hook will run it "
                "automatically, but verify: README badge, CHANGELOG version, "
                "copilot-instructions test count, and ci.yml comment all match "
                "actual npm test output."
            )
        elif GIT_COMMIT_RE.search(joined):
            messages.append(
                "Post-commit governance check: if this commit changes code behavior, "
                "ensure CHANGELOG, README, system-stability.md, and copilot-instructions.md "
                "are updated in the same commit or a follow-up before pushing."
            )

    if messages:
        out = {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": " | ".join(messages),
            },
            "systemMessage": "Governance reminder injected after "
            + ("doc edit" if len(messages) == 1 and "Standards" in messages[0]
               else "git operation detected") + ".",
        }
        print(json.dumps(out))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
