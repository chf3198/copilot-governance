#!/usr/bin/env python3
"""Live GitHub API checks for pretool_guard hooks."""
import json, re, subprocess, time
from planning_consensus import linked_issue_has_planning_consensus as _linked_issue_has_planning_consensus

RE_BRANCH_ISSUE = re.compile(r"(?:feat|fix|hotfix)/(\d+)-")
PENDING_STATES = {"PENDING", "IN_PROGRESS", "QUEUED", "REQUESTED", "WAITING"}
PASS_CONCLUSIONS = {"success", "skipped", "neutral"}
FAIL_CONCLUSIONS = {"failure", "failed", "timed_out", "cancelled", "action_required", "startup_failure"}


def classify_ci_checks(checks: list[dict]) -> str:
    """Classify GH checks into pending-only, failing, green, or unknown."""
    if not checks:
        return "unknown"
    has_pending = False
    for c in checks:
        state = str(c.get("state", "")).upper()
        conclusion = str(c.get("conclusion", "")).lower()
        if state in PENDING_STATES:
            has_pending = True
            continue
        if conclusion and conclusion in FAIL_CONCLUSIONS:
            return "failing"
        if state in {"FAILURE", "FAILED", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "ERROR"}:
            return "failing"
        if conclusion and conclusion not in PASS_CONCLUSIONS:
            return "failing"
    if has_pending:
        return "pending-only"
    return "green"


def classify_merge_flow_state(checks: list[dict], merge_policy_blocked: bool = False) -> str:
    """Extend CI classification with policy-blocked merge outcome state."""
    ci_state = classify_ci_checks(checks)
    if ci_state == "green" and merge_policy_blocked:
        return "green-but-policy-blocked"
    return ci_state


# gh exit codes for `gh pr checks`: 0 = all pass, 8 = pending, 1 = failing.
GH_CHECKS_EXIT = {0: "green", 8: "pending-only", 1: "failing"}


def _exit_code_status(pr_ref: str, cwd: str) -> str:
    """Fallback classifier using gh's plain exit code (no --json)."""
    try:
        r = subprocess.run(
            ["gh", "pr", "checks", pr_ref],
            capture_output=True, text=True, cwd=cwd, timeout=20,
        )
        return GH_CHECKS_EXIT.get(r.returncode, "unknown")
    except Exception:
        return "unknown"


def ci_gate_status(pr_ref: str, cwd: str) -> str:
    """Fetch and classify PR check status for merge gating."""
    try:
        r = subprocess.run(
            ["gh", "pr", "checks", pr_ref, "--json", "name,state,conclusion"],
            capture_output=True, text=True, cwd=cwd, timeout=20,
        )
    except Exception:
        return "unknown"
    try:
        checks = json.loads(r.stdout or "[]")
    except (ValueError, TypeError):
        checks = []
    # `gh pr checks --json` can exit non-zero with empty stdout for an all-green
    # PR (observed #2595). An empty list would classify "unknown" and false-block
    # the merge — fall back to gh's plain exit code instead.
    if checks:
        return classify_ci_checks(checks)
    return _exit_code_status(pr_ref, cwd)


_STABLE_RETRY_DELAYS = (1.5, 3.0)


def ci_gate_status_stable(pr_ref: str, cwd: str, attempts: int = 3, sleep_fn=None) -> str:
    """ci_gate_status with bounded retry on the INDETERMINATE 'unknown' state.

    'unknown' means the status could not be determined (empty/flaky gh query),
    not that CI is failing — conflating them false-blocks a green merge (#2603).
    Re-query a few times; return the first definitive state (green/failing/
    pending-only), or 'unknown' if it persists (then the gate still blocks).
    """
    sleep = sleep_fn or time.sleep
    state = ci_gate_status(pr_ref, cwd)
    for i in range(max(0, attempts - 1)):
        if state != "unknown":
            return state
        sleep(_STABLE_RETRY_DELAYS[min(i, len(_STABLE_RETRY_DELAYS) - 1)])
        state = ci_gate_status(pr_ref, cwd)
    return state


def ci_all_pass(pr_ref: str, cwd: str) -> bool:
    """Compatibility helper: True only when checks are fully green."""
    return ci_gate_status(pr_ref, cwd) == "green"


def linked_issue_has_collab_handoff(cwd: str) -> bool:
    """Return True if linked issue (from branch name) has COLLABORATOR_HANDOFF comment."""
    try:
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            text=True, stderr=subprocess.DEVNULL, cwd=cwd,
        ).strip()
        m = RE_BRANCH_ISSUE.match(branch)
        if not m:
            return True  # branch has no ticket ref → can't block
        r = subprocess.run(
            ["gh", "issue", "view", m.group(1), "--json", "comments"],
            capture_output=True, text=True, cwd=cwd, timeout=20,
        )
        data = json.loads(r.stdout or "{}")
        return any("COLLABORATOR_HANDOFF" in c.get("body", "") for c in data.get("comments", []))
    except Exception:
        return True  # on API error → allow (fail open, not block)


def linked_issue_has_manager_handoff(cwd: str) -> bool:
    """Return True if linked issue (from branch name) has MANAGER_HANDOFF comment."""
    try:
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            text=True, stderr=subprocess.DEVNULL, cwd=cwd,
        ).strip()
        m = RE_BRANCH_ISSUE.match(branch)
        if not m:
            return True  # branch has no ticket ref → can't block
        r = subprocess.run(
            ["gh", "issue", "view", m.group(1), "--json", "comments"],
            capture_output=True, text=True, cwd=cwd, timeout=20,
        )
        data = json.loads(r.stdout or "{}")
        return any("MANAGER_HANDOFF" in c.get("body", "") for c in data.get("comments", []))
    except Exception:
        return True  # on API error → allow (fail open, not block)


def linked_issue_has_planning_consensus(cwd: str) -> bool:
    """Return True when linked ticket has a qualifying planning-consensus artifact.

    This check is intentionally fail-closed for ticket branches: if we cannot
    verify consensus evidence, execution transition is blocked with remediation.
    """
    try:
        return _linked_issue_has_planning_consensus(cwd)
    except Exception:
        return False


def check_merged_pr(branch: str, cwd: str) -> int | None:
    """Return the merged PR number for branch if one exists, None otherwise.

    Fail-open: returns None on any error (gh CLI unavailable, timeout, etc.).
    Refs #2878 (AC-I3.1).
    """
    try:
        r = subprocess.run(
            ["gh", "pr", "list", "--head", branch, "--state", "merged", "--json", "number"],
            capture_output=True, text=True, cwd=cwd, timeout=20,
        )
        data = json.loads(r.stdout or "[]")
        if data:
            return int(data[0]["number"])
        return None
    except Exception:
        return None  # fail-open — never block on API error


def open_pr_for_ref(pr_ref, cwd: str):
    """Return True if pr_ref resolves to an OPEN PR, False if it resolves to a
    non-open/absent PR, None on an indeterminate gh error. Refs #3344.

    Used by the pretool_guard merge gate: when the cwd-keyed admin_ops.pr_create
    flag is lost to cwd-churn, the gate verifies a *real* OPEN PR exists for the
    merge ref before blocking. Fail-CLOSED — callers allow ONLY on True; both a
    genuine 'no PR' (False) and an indeterminate gh failure (None) keep the block.
    """
    if not pr_ref:
        return None
    try:
        r = subprocess.run(
            ["gh", "pr", "view", str(pr_ref), "--json", "state,number"],
            capture_output=True, text=True, cwd=cwd, timeout=20,
        )
        if r.returncode != 0:
            return False  # gh exits non-zero when no PR is found for the ref
        data = json.loads(r.stdout or "{}")
        return data.get("state") == "OPEN"
    except Exception:
        return None  # timeout / gh absent / parse error -> indeterminate (fail-closed)
