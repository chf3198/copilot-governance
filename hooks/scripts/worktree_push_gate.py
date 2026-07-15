"""#3168 — resolve the worktree a push targets so the Admin commit-step gate
reads commit state from the pushed branch's worktree, not only the session
(main-checkout) cwd.

The push gate keys admin_ops on the SESSION cwd. When governed work lives in a
linked worktree but the session cwd is the main checkout (stuck on `main` with no
ticket commits), the recorded commit flag is unreachable and the gate falsely
blocks the push. These helpers locate the worktree the push acts on and confirm
the commit step ran there — preferring a REAL commit ahead of base, which is a
stronger signal than the in-session flag.
"""
import re
import subprocess

_DASH_C_RE = re.compile(r"git\s+-C\s+(\S+)")
_CD_RE = re.compile(r"cd\s+(\S+)\s*&&")


def resolve_push_cwd(joined, cwd):
    """The directory the push acts on: an explicit `git -C <path>` wins, then a
    leading `cd <path> &&`, otherwise the session cwd.
    """
    dash_c = _DASH_C_RE.search(joined or "")
    if dash_c:
        return dash_c.group(1)
    chdir = _CD_RE.search(joined or "")
    if chdir:
        return chdir.group(1)
    return cwd


def branch_has_commit_ahead(push_cwd, bases=("origin/main", "main")):
    """True when the worktree branch has at least one commit not on its base —
    a cwd-independent signal the Admin commit step actually produced a commit.
    Fails closed (False) on any git error so the session-state check still governs.
    """
    for base in bases:
        try:
            result = subprocess.run(
                ["git", "-C", push_cwd, "rev-list", "--count", f"{base}..HEAD"],
                check=False, capture_output=True, text=True, timeout=5)
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
            return False
        if result.returncode == 0:
            try:
                return int((result.stdout or "0").strip() or "0") > 0
            except ValueError:
                return False
    return False




def _worktree_paths(cwd=None):
    """Linked worktree paths from `git worktree list --porcelain` (best-effort; [] on error).
    Scoped to the repo at `cwd` when given, so a non-repo cwd yields [] (no cross-repo leak).
    """
    cmd = ["git"] + (["-C", cwd] if cwd else []) + ["worktree", "list", "--porcelain"]
    try:
        out = subprocess.run(
            cmd, check=False, capture_output=True, text=True, timeout=5)
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return []
    if out.returncode != 0:
        return []
    return [line[len("worktree "):].strip()
            for line in (out.stdout or "").splitlines() if line.startswith("worktree ")]


def any_worktree_commit_ahead(cwd=None, bases=("origin/main", "main")):
    """True when ANY linked worktree's branch has a commit ahead of base -- a cwd-independent
    proof the Admin commit step ran, robust to cwd-churn / rebase state resets (#3469).
    Fails closed (False) on any git error so the session-state check still governs.
    """
    return any(branch_has_commit_ahead(path, bases) for path in _worktree_paths(cwd))


def commit_step_satisfied(joined, cwd, session_committed, load_state):
    """Decide whether the Admin commit-step is satisfied for a push.

    Returns (satisfied, used_worktree_fallback). Satisfied when: the session state
    recorded the commit, OR the pushed branch's worktree state recorded it, OR the
    branch has a real commit ahead of base. The fallback flag drives the
    worktree-push-gate-commit-desync observability signal (AC3).
    """
    if session_committed:
        return True, False
    push_cwd = resolve_push_cwd(joined, cwd)
    if push_cwd != cwd:
        worktree_state = load_state(push_cwd)
        if (worktree_state.get("admin_ops") or {}).get("commit"):
            return True, True
    if branch_has_commit_ahead(push_cwd):
        return True, True
    # #3469: resolve_push_cwd fell back to the main checkout (no `-C`/`cd` in the push
    # command) and/or a rebase reset the session commit flag. Re-derive the signal from
    # live git across ALL linked worktrees so a real commit ahead of base authorizes the
    # push with no manual hook-state patch.
    if any_worktree_commit_ahead(cwd):
        return True, True
    return False, False
