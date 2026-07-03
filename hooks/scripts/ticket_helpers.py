#!/usr/bin/env python3
"""Ticket validation and linking helpers."""
import re
from typing import Optional, Tuple


def extract_issue_num(text: str) -> Optional[int]:
    """Extract GitHub issue number from text (e.g., #123 or closes #456)."""
    match = re.search(r'#(\d+)', text)
    return int(match.group(1)) if match else None


def extract_from_branch(branch: str) -> Optional[int]:
    """Extract issue number from branch name (e.g., #123-my-feature)."""
    match = re.match(r'^#?(\d+)-', branch)
    return int(match.group(1)) if match else None


def extract_from_commit(commit_msg: str) -> Optional[int]:
    """Extract issue from commit (e.g., closes #123)."""
    return extract_issue_num(commit_msg)


def validate_ticket_linkage(
    branch: str, commit_msg: str
) -> Tuple[bool, str, Optional[int]]:
    """
    Validate that branch and commit are linked to same ticket.
    Returns (valid, reason, issue_num).
    """
    branch_issue = extract_from_branch(branch)
    commit_issue = extract_from_commit(commit_msg)

    if not branch_issue:
        return (False, 'branch must start with #123-', None)
    if not commit_issue:
        return (False, 'commit must reference closes #123', None)
    if branch_issue != commit_issue:
        return (
            False,
            f'branch #{branch_issue} != commit #{commit_issue}',
            None
        )
    return (True, 'ticket linkage valid', branch_issue)
