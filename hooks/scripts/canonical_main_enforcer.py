"""Canonical-main read-only enforcer (.gitignore-allowlist policy).

Phase-1 C6 of Epic #2091 (Refs #2107). Per the Phase-0 synthesis at
wiki/wisdom/project/research/harness-state-isolation.md (Fix #3):

The main checkout (~/devenv-ops/) is canonical-only during sessions.
Writes are permitted ONLY to paths matching .gitignore patterns (per-operator
config + tooling artifacts). Tracked files are read-only. Branch switches
off `main` are rejected.

2026 secrets-management trajectory caveat: as Megingjord migrates secrets
out of .env into workload-identity (Bitwarden / Infisical / Zylos), this
allowlist should narrow over time.
"""
import os
import subprocess
from pathlib import Path


def main_checkout_root() -> str:
    """Return the canonical main checkout path as a string."""
    return str(Path.home() / "devenv-ops")


def is_main_checkout(cwd: str) -> bool:
    """Return True if cwd is the canonical main checkout path.

    The main checkout is `${HOME}/devenv-ops/` (no team suffix, no -N suffix).
    Worktrees follow the pattern `${HOME}/devenv-ops-<team-or-ticket>/`.
    """
    if not cwd:
        return False
    cwd_path = Path(cwd).resolve()
    main = Path.home() / "devenv-ops"
    try:
        return cwd_path == main.resolve()
    except (OSError, RuntimeError):
        return False


def is_gitignored(path: str, repo_root: str) -> bool:
    """Return True if path is ignored by git in the repo at repo_root.

    Uses `git check-ignore` (the authoritative ignore resolver). Returns
    False for paths outside the repo, non-existent paths, or any error.
    """
    if not path or not repo_root:
        return False
    try:
        result = subprocess.run(
            ["git", "-C", repo_root, "check-ignore", "-q", path],
            check=False, capture_output=True, timeout=5,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return False


def is_tracked(path: str, repo_root: str) -> bool:
    """Return True if path is tracked by git in the repo at repo_root.

    Uses `git ls-files --error-unmatch`. Returns False for untracked paths,
    paths outside the repo, or any error.
    """
    if not path or not repo_root:
        return False
    try:
        result = subprocess.run(
            ["git", "-C", repo_root, "ls-files", "--error-unmatch", path],
            check=False, capture_output=True, timeout=5,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return False


def evaluate_path(path: str, repo_root: str) -> tuple[bool, str]:
    """Evaluate whether a path is writable inside the canonical main checkout.

    Returns (allowed, reason).
      allowed=True  → path is gitignored AND not tracked (per-operator config /
                      tooling artifact); write is permitted in main checkout.
      allowed=False → path is tracked OR not ignored; write is rejected.
                      Reason explains and recommends worktree redirection.

    Edge cases handled: empty path → reject; absolute path outside repo →
    allow (operator-local, other worktrees, /tmp — not canonical-main concerns);
    relative path escaping repo via `..` → reject (path-traversal guard);
    symlinks resolved by git ls-files / check-ignore semantics.
    """
    if not path:
        return False, "empty path"
    # Use absolute() not resolve() so we DON'T follow symlinks. node_modules
    # is commonly a symlink in worktrees pointing at the main checkout's copy;
    # following it produces a false "path outside repo" rejection.
    abs_path = Path(path).absolute() if Path(path).is_absolute() else (
        Path(repo_root).absolute() / path
    )
    # Reject path-traversal that ESCAPES repo root after normalizing `..`
    # (without symlink resolution).
    try:
        normalized = Path(os.path.normpath(str(abs_path)))
        repo_norm = Path(os.path.normpath(str(Path(repo_root).absolute())))
        normalized.relative_to(repo_norm)
    except ValueError:
        # Path is outside the canonical main-checkout repo root.
        # If the original path was absolute, it is an out-of-scope location
        # (operator-local memory, another worktree, /tmp, etc.) and is allowed.
        # If the original path was relative but escaped via `..`, treat it as a
        # path-traversal attempt and deny it.
        if Path(path).is_absolute():
            return True, "allowed: path outside main-checkout repo"
        return False, f"path-traversal rejected: relative path escapes repo root: {path}"
    rel = str(normalized.relative_to(repo_norm))
    if is_tracked(rel, repo_root):
        return False, (
            f"canonical-main read-only: '{rel}' is git-tracked. "
            "Use a dedicated worktree (devenv-ops-<team-or-ticket>/) for code edits."
        )
    if not is_gitignored(rel, repo_root):
        return False, (
            f"canonical-main read-only: '{rel}' is neither gitignored nor tracked. "
            "Untracked new paths in main checkout are rejected to prevent untracked-leak. "
            "Use a dedicated worktree for new file creation."
        )
    return True, f"allowed: '{rel}' is gitignored (per-operator config or tooling artifact)"
