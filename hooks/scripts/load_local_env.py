#!/usr/bin/env python3
"""Python parity of scripts/global/load-local-env.js (#2770, Epic #2291).

Closes the G9 cross-runtime gap: the JS hydration shim was JS-only. This is the SAME
5-clause contract for any Python credential consumer:
  fill-don't-override (a real/CI env value always wins),
  secret-safe (names-only audit, never values),
  graceful (missing/malformed .env is a no-op, never raises),
  opt-out via MEGINGJORD_NO_DOTENV=1,
  relocate via MEGINGJORD_DOTENV_PATH.
require_keys() adds the fail-closed assertion: a declared-required key absent after hydration
raises CredentialAbsent (never prompt the client - G1/G4).
"""
import os
import re

# Repo root is two levels up from hooks/scripts/.
DEFAULT_ENV_PATH = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_hydrated_once = False


class CredentialAbsent(RuntimeError):
    """A declared-required credential is absent after hydration (fail-closed). Carries .absent."""

    def __init__(self, absent):
        """Build the fail-closed error; `absent` is the list of missing required key names."""
        super().__init__(
            "required credential(s) absent after hydration: [%s] -- resolve via terminal "
            "entry or approved auth; never prompt the client (G1/G4)" % ",".join(absent))
        self.absent = absent
        self.code = "CREDENTIAL_ABSENT"


def parse_env(text):
    """Parse .env text -> list[(name, value)]; skips blanks/comments/malformed; strips export + quotes."""
    pairs = []
    for raw in str(text).splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        body = line[7:].strip() if line.startswith("export ") else line
        if "=" not in body:
            continue
        name, _, value = body.partition("=")
        name, value = name.strip(), value.strip()
        if not _IDENT.match(name):
            continue
        if len(value) >= 2 and ((value[0] == '"' and value[-1] == '"') or (value[0] == "'" and value[-1] == "'")):
            value = value[1:-1]
        pairs.append((name, value))
    return pairs


def load_local_env(env=None, path=None, quiet=False):
    """Hydrate env from the repo-root .env. Fill-don't-override; never raises. Returns dict report."""
    target = os.environ if env is None else env
    if target.get("MEGINGJORD_NO_DOTENV") == "1":
        return {"filled": [], "skipped": "disabled"}
    env_path = path or target.get("MEGINGJORD_DOTENV_PATH") or DEFAULT_ENV_PATH
    try:
        with open(env_path, "r", encoding="utf-8") as handle:
            text = handle.read()
    except OSError:
        return {"filled": [], "skipped": "missing"}  # G5/G6: no file -> pass-through
    try:
        pairs = parse_env(text)
    except Exception:
        return {"filled": [], "skipped": "parse-error"}  # never raise into the consumer
    filled = []
    for name, value in pairs:
        if name not in target:
            target[name] = value
            filled.append(name)
    if filled and not quiet:
        # NAMES only, never values (G4/G8).
        import sys
        sys.stderr.write("env-hydrate(py): filled=[%s] count=%d source=.env\n" % (",".join(filled), len(filled)))
    return {"filled": filled, "skipped": None}


def load_local_env_once():
    """Idempotent once-per-process hydration of os.environ (hot paths)."""
    global _hydrated_once
    if _hydrated_once:
        return {"filled": [], "skipped": "cached"}
    _hydrated_once = True
    return load_local_env()


def require_keys(required, env=None, throw_on_absent=True):
    """Hydrate once, then assert every declared-required key is present -- fail-closed (#2770).

    Optional keys are not checked (degrade silently). Never prompts. Raises CredentialAbsent on a
    missing required key unless throw_on_absent is False, in which case it returns the report.
    """
    load_local_env_once()
    target = os.environ if env is None else env
    names = [required] if isinstance(required, str) else list(required)
    absent = [n for n in names if not target.get(n)]
    if absent and throw_on_absent:
        raise CredentialAbsent(absent)
    return {"ok": not absent, "absent": absent}


if __name__ == "__main__":
    load_local_env()
