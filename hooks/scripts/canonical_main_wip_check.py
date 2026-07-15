#!/usr/bin/env python3
"""SessionStart hook (Epic #2658 #2663): runtime-agnostic advisory check for stranded
tracked WIP in the canonical main checkout, left by ANY runtime. Non-blocking — emits
an advisory only. Auto-quarantine is opt-in via MEGINGJORD_CANONICAL_MAIN_ENFORCE=1.
"""
import json
import os
import subprocess
import sys

CHECKOUT = os.path.join(os.path.expanduser("~"), "devenv-ops")
GUARD = os.path.join(CHECKOUT, "scripts", "global", "canonical-main-wip-guard.js")


def main() -> int:
    if not os.path.isfile(GUARD):
        return 0
    try:
        result = subprocess.run(
            ["node", GUARD, CHECKOUT], capture_output=True, text=True, timeout=8, check=False,
        )
        message = (result.stderr or result.stdout).strip()
        if message:
            print(json.dumps({"hookEventName": "SessionStart", "additionalContext": message}))
    except Exception:
        pass  # advisory hook must never break session start
    return 0


if __name__ == "__main__":
    sys.exit(main())
