"""#2910 — Authorization profile runtime enforcement (G-05, OWASP ASI02).

Provides capability checks for pretool_guard.py: reads MEGINGJORD_AUTH_PROFILE
from the environment, loads the capability matrix from config, and returns
allow/deny decisions for privileged operations.

Fail-open design: any load error falls back to 'owner' (full authority) so
the enforcer never bricks the hook on a misconfigured environment.
"""
import json
import os
import re
from pathlib import Path

_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "authorization-profiles.json"
_VALID_PROFILES = ("owner", "guarded", "restricted")

# Regex patterns mapping commands to required capabilities
_INSTALL_RE = re.compile(
    r"\bnpm\s+(?:install|i|ci)\b"
    r"|\bpip3?\s+install\b"
    r"|\bapt(?:-get)?\s+install\b"
    r"|\bbrew\s+install\b"
    r"|\byarn\s+add\b"
    r"|\bpnpm\s+(?:install|add)\b"
    r"|\bcargo\s+install\b"
    r"|\bgo\s+install\b"
)
_PRIVILEGED_RE = re.compile(
    r"(?:^|[\s;|&])\bsudo\b"
    r"|(?:^|[\s;|&])\bsu\s+-"
    r"|\bchown\b"
)
_EXECUTE_REMOTE_RE = re.compile(
    r"(?:^|[\s;|&])\bssh\b\s+\S"
    r"|(?:^|[\s;|&])\bscp\b\s+\S"
    r"|\brsync\b[^|&\n]*\w@[\w.]+:"
    r"|(?:^|[\s;|&])\bansible(?:-playbook)?\b"
)


def _load_profile(env: dict | None = None) -> tuple[str, dict]:
    """Load active profile name and capability dict. Fail-open → owner."""
    env = env if env is not None else os.environ
    profile = (env.get("MEGINGJORD_AUTH_PROFILE") or "owner").lower()
    if profile not in _VALID_PROFILES:
        profile = "owner"
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            schema = json.load(f)
        caps = schema["profiles"][profile]
    except Exception:
        caps = {k: True for k in ("install", "upgrade", "privileged", "execute_local", "execute_remote")}
    return profile, caps


def check_capability(capability: str, env: dict | None = None) -> tuple[bool, str]:
    """Return (allowed, reason) for a named capability under the active profile.

    Fail-open: if the capability name is not in the matrix, return (True, reason).
    """
    profile, caps = _load_profile(env)
    if capability not in caps:
        return True, f"Capability '{capability}' not in profile matrix — skipped"
    allowed = bool(caps[capability])
    if allowed:
        return True, f"Profile '{profile}' permits '{capability}'"
    return False, (
        f"Profile '{profile}' blocks '{capability}' (#2910, G-05, ASI02). "
        f"Switch to MEGINGJORD_AUTH_PROFILE=owner to re-enable."
    )


def check_command(command: str, env: dict | None = None) -> tuple[bool, str] | None:
    """Check a shell command string against the active authorization profile.

    Returns (False, reason) for the first denied capability, or None if all permitted.
    Fail-open: any detection error returns None (never block on enforcer bug).
    """
    try:
        if _INSTALL_RE.search(command):
            allowed, reason = check_capability("install", env)
            if not allowed:
                return False, reason
        if _PRIVILEGED_RE.search(command):
            allowed, reason = check_capability("privileged", env)
            if not allowed:
                return False, reason
        if _EXECUTE_REMOTE_RE.search(command):
            allowed, reason = check_capability("execute_remote", env)
            if not allowed:
                return False, reason
    except Exception:
        pass  # Fail-open: detection errors never block
    return None
