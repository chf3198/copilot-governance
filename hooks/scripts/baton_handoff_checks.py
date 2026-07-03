#!/usr/bin/env python3
"""Branch-scoped MANAGER_HANDOFF authority checks (#3204, extends #2876)."""
import json
import re
import subprocess

RE_BRANCH_ISSUE = re.compile(r"(?:feat|fix|hotfix)/(\d+)-")
RE_MH_HEADER = re.compile(r"(^|\n)\s*(?:\*\*|##\s+)?MANAGER_HANDOFF\b")
RE_WT_BRANCH = re.compile(r"(?:^|\n)\s*worktree_branch:\s*(\S+)", re.IGNORECASE)


def _branch_and_issue(cwd: str) -> tuple[str, str | None]:
    branch = subprocess.check_output(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        text=True, stderr=subprocess.DEVNULL, cwd=cwd,
    ).strip()
    m = RE_BRANCH_ISSUE.match(branch)
    return branch, (m.group(1) if m else None)


def _issue_comments(issue_num: str, cwd: str) -> list:
    r = subprocess.run(
        ["gh", "issue", "view", issue_num, "--json", "comments"],
        capture_output=True, text=True, cwd=cwd, timeout=20,
    )
    return json.loads(r.stdout or "{}").get("comments", [])


def latest_manager_handoff_body(comments: list) -> str | None:
    body = None
    for c in comments:
        text = str(c.get("body") or "")
        if RE_MH_HEADER.search(text):
            body = text
    return body


def worktree_branch_from_handoff(body: str) -> str | None:
    m = RE_WT_BRANCH.search(body or "")
    return m.group(1).strip() if m else None


def linked_issue_has_authoritative_manager_handoff(cwd: str) -> bool:
    """Latest MANAGER_HANDOFF must declare worktree_branch matching HEAD (#3204)."""
    try:
        branch, issue = _branch_and_issue(cwd)
        if not issue:
            return True
        mh = latest_manager_handoff_body(_issue_comments(issue, cwd))
        if not mh:
            return False
        wt = worktree_branch_from_handoff(mh)
        return bool(wt) and wt == branch
    except Exception:
        return True
