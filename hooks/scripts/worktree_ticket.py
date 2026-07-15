"""Path-derived governed-worktree + ticket resolution for the pre-tool gate.

Shared by pretool_guard.py to fix #2586 (the active-ticket gate keys on the
session cwd = main checkout, not the worktree of the edited file) and #2587
(the no-active-ticket deny fires for paths outside any governed repo).

Runtime-neutral (Epic #2585 contract): reads only filesystem + git state, never
the runtime identity. Every function degrades gracefully (returns None/False)
on any error, so the hook never crashes and never *newly* blocks. Callers read
edited paths via admin_patterns.iter_paths (no hardcoded per-runtime keys).
"""
import os
import re
import subprocess
from pathlib import Path

# Tolerant: matches type/<N>-slug, #<N>-slug, and bare <N>-slug; None otherwise
# (main, dependabot/*, detached HEAD -> no ticket -> graceful fallback).
_TICKET_RE = re.compile(r"(?:^|/)#?(\d+)-")


def _git(args, cwd):
    try:
        res = subprocess.run(["git", "-C", cwd, *args], check=False,
                             capture_output=True, text=True, timeout=5)
        return res.stdout.strip() if res.returncode == 0 else None
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return None


def _is_governed_root(toplevel):
    """True only for the main checkout or a ~/devenv-ops-<suffix> worktree.

    Mitigation A (#2585): rejects nested/submodule repos so a stray inner repo
    can neither satisfy the gate (false-allow) nor be treated as governed.
    """
    if not toplevel:
        return False
    try:
        top = Path(toplevel).resolve()
    except (OSError, RuntimeError):
        return False
    home = Path.home()
    main = (home / "devenv-ops").resolve()
    return top == main or (top.name.startswith("devenv-ops-") and top.parent == home)


def governed_toplevel(path):
    """Return the governed git toplevel containing path, else None."""
    if not path:
        return None
    directory = path if os.path.isdir(path) else (os.path.dirname(path) or ".")
    top = _git(["rev-parse", "--show-toplevel"], directory)
    return top if _is_governed_root(top) else None


def ticket_from_branch(branch):
    """Extract the issue number from a branch name; None if non-conforming."""
    if not branch:
        return None
    match = _TICKET_RE.search(branch)
    return int(match.group(1)) if match else None


def resolve_ticket_from_paths(paths):
    """First governed path whose worktree branch yields a ticket -> int, else None."""
    for path in paths or []:
        top = governed_toplevel(path)
        if not top:
            continue
        ticket = ticket_from_branch(_git(["rev-parse", "--abbrev-ref", "HEAD"], top))
        if ticket:
            return ticket
    return None


def any_path_in_governed_repo(paths):
    """True if any path resolves inside a governed checkout/worktree."""
    return any(governed_toplevel(p) for p in (paths or []))
