#!/usr/bin/env python3
"""SessionStart hook (#2667): register THIS runtime's active session so the
canonical-main-wip-guard can attribute stranded WIP to a runtime instead of guessing.
Runtime is detected via #2659 detect-runtime.js; registration self-cleans (pid + TTL).
Non-blocking; never breaks session start.
"""
import os
import subprocess

ROOT = os.path.join(os.path.expanduser("~"), "devenv-ops")
DETECT = os.path.join(ROOT, "scripts", "global", "detect-runtime.js")
REGISTER = os.path.join(ROOT, "scripts", "global", "runtime-session-registry.js")


def main() -> int:
    if not (os.path.isfile(DETECT) and os.path.isfile(REGISTER)):
        return 0
    try:
        import json
        detected = json.loads(subprocess.run(["node", DETECT], capture_output=True, text=True, timeout=6, check=False).stdout or "{}")
        runtime = detected.get("runtime", "unknown")
        if runtime and runtime != "unknown" and detected.get("confidence") == "high":
            subprocess.run(["node", REGISTER, "register", runtime], capture_output=True, text=True, timeout=6, check=False)
    except Exception:
        pass  # advisory registration must never break session start
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
