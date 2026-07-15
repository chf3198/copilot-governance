"""#3350 AC3 — local pre-close guard for Epics with open children.

Prevention-first guardrail (per global-standards "local guardrails first, CI
backstops second"): blocks the operator close path on a `type:epic` issue that
still has open children, BEFORE the close reaches GitHub — so the CI backstop
(epic-close-readiness) never has to reopen it.

Detected close paths:
  - `gh issue close <N>`
  - a state-patch API call: `gh api ... repos/.../issues/<N> ... -f state=closed`
    (also `--field state=closed` / `state":"closed"`)

Escape hatch (the rare children-already-re-homed case): set
EPIC_CLOSE_OVERRIDE=1, or include the literal `[epic-close-ok]` marker in the
command. Override emits an allow advisory (never silent).

Fail-open: any probe/parse error returns None (no decision) so a misconfigured
environment or API hiccup never bricks a close (G6).
"""
import json
import os
import re
import subprocess
from pathlib import Path

# `gh issue close 3021` / `gh issue close #3021`
_CLOSE_CLI_RE = re.compile(r"\bgh\s+issue\s+close\s+#?(\d+)\b")
# `gh api ... issues/3021 ...` paired with a state=closed assignment anywhere
_API_ISSUE_RE = re.compile(r"\bissues/(\d+)\b")
_STATE_CLOSED_RE = re.compile(r"state[\"'=:\s]+closed", re.IGNORECASE)
_OVERRIDE_MARKER = "[epic-close-ok]"


def parse_close_target(joined: str) -> int | None:
    """Return the issue number an epic-close command targets, else None."""
    m = _CLOSE_CLI_RE.search(joined)
    if m:
        return int(m.group(1))
    if "gh api" in joined and _STATE_CLOSED_RE.search(joined):
        m2 = _API_ISSUE_RE.search(joined)
        if m2:
            return int(m2.group(1))
    return None


def has_override(joined: str, env: dict | None = None) -> bool:
    env = env if env is not None else os.environ
    return env.get("EPIC_CLOSE_OVERRIDE") == "1" or _OVERRIDE_MARKER in joined


def should_block(is_epic: bool, open_children: list, override: bool) -> tuple[bool, str | None]:
    """Pure decision: block only a real epic with >=1 open child and no override."""
    if override or not is_epic or not open_children:
        return False, None
    kids = ", ".join(f"#{n}" for n in open_children)
    reason = (
        f"Epic close blocked: {len(open_children)} open child issue(s) remain ({kids}). "
        "An Epic may close only when ALL children are terminal "
        "(epic-governance.instructions.md). Terminalise or re-home the children first, "
        "or set EPIC_CLOSE_OVERRIDE=1 / add the [epic-close-ok] marker for an audited "
        "intentional close (e.g. children already re-homed)."
    )
    return True, reason


def _probe(epic_num: int, cwd: str) -> dict | None:
    """Run the shared union probe; None on any failure (fail-open)."""
    probe = Path(__file__).resolve().parents[2] / "scripts" / "global" / "epic-close-child-probe.js"
    if not probe.exists():
        return None
    try:
        out = subprocess.run(
            ["node", str(probe), str(epic_num)],
            cwd=cwd, capture_output=True, text=True, timeout=20,
        )
        if out.returncode != 0 or not out.stdout.strip():
            return None
        return json.loads(out.stdout.strip())
    except Exception:
        return None


def check_command(joined: str, cwd: str, env: dict | None = None) -> tuple[bool, str | None] | None:
    """Hook entry. Returns (allowed, reason) when a decision applies, else None."""
    target = parse_close_target(joined)
    if target is None:
        return None
    if has_override(joined, env):
        return True, f"Epic-close override accepted for #{target} ([epic-close-ok]/EPIC_CLOSE_OVERRIDE)."
    probed = _probe(target, cwd)
    if probed is None:
        return None  # fail-open
    blocked, reason = should_block(
        bool(probed.get("isEpic")), probed.get("openChildren") or [], False)
    if blocked:
        return False, reason
    return None
