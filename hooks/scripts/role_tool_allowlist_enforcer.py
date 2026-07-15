"""#2919 — Role-scoped tool allowlist enforcer (G-16, OWASP ASI02/ASI06).

Provides baton-phase capability checks for pretool_guard.py: reads
current_phase from governance state and checks terminal commands against
the per-role allowlist in config/role-tool-allowlist.json.

Fail-open design: any load or detection error returns None so the enforcer
never bricks the hook on a misconfigured environment.
"""
import json
import re
from pathlib import Path

_CONFIG_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "config" / "role-tool-allowlist.json"
)
_KNOWN_ROLES = ("manager", "collaborator", "admin", "consultant")

_GIT_PUSH_RE = re.compile(r"(?:^|[\s;|&])git\s+push\b")
_PR_MERGE_RE = re.compile(r"(?:^|[\s;|&])gh\s+pr\s+merge\b")
_DEPLOY_RE = re.compile(
    r"(?:^|[\s;|&])npm\s+run\s+deploy(?:[:\w-]*)?\b"
    r"|(?:^|[\s;|&])npx\s+vsce\s+publish\b"
    r"|(?:^|[\s;|&])gh\s+release\s+create\b"
)
_BRANCH_CREATE_RE = re.compile(
    r"(?:^|[\s;|&])git\s+(?:checkout\s+-b|switch\s+-c)\s+\S"
)

_OPERATION_PATTERNS = {
    "git_push": _GIT_PUSH_RE,
    "pr_merge": _PR_MERGE_RE,
    "deploy": _DEPLOY_RE,
    "git_branch_create": _BRANCH_CREATE_RE,
}


def _load_allowlist() -> dict:
    """Load role allowlist config. Returns empty dict on error (fail-open)."""
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f).get("roles", {})
    except Exception:
        return {}


def infer_operations(command: str) -> list[str]:
    """Return list of operation names detected in command."""
    ops = []
    for op, pattern in _OPERATION_PATTERNS.items():
        if pattern.search(command):
            ops.append(op)
    return ops


def check_command(command: str, phase: str | None) -> tuple[bool, str] | None:
    """Check command against the allowlist for the active baton phase.

    Returns (False, reason) for the first denied operation, or None if
    all operations are permitted (or phase is unknown — fail-open).
    """
    try:
        if not phase or phase not in _KNOWN_ROLES:
            return None
        operations = infer_operations(command)
        if not operations:
            return None
        allowlist = _load_allowlist()
        if not allowlist:
            return None
        role_caps = allowlist.get(phase, {})
        for op in operations:
            if op in role_caps and not role_caps[op]:
                return False, (
                    f"Role '{phase}' blocks '{op}' (#2919, G-16, ASI02). "
                    f"Advance the baton to the appropriate phase before "
                    f"attempting this operation."
                )
    except Exception:
        pass  # Fail-open: detection errors never block
    return None
