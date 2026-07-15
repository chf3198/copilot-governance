#!/usr/bin/env python3
"""PreToolUse: block git commit when no GitHub issue reference present.

Extends commit_ticket_gate.py with Claude Code Bash tool support.
"""
import json
import os
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from repo_scope import is_repo_enabled

ISSUE_RE = re.compile(r'#(\d+)')
BRANCH_ISSUE_RE = re.compile(r'(?:feat|fix|chore|docs|style|test|refactor|perf)/(\d+)-')


def get_branch() -> str:
    try:
        import subprocess
        return subprocess.check_output(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ''


def block(reason: str) -> int:
    print(json.dumps({'decision': 'block', 'reason': reason}))
    return 0


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool = str(payload.get('tool_name', ''))
    cwd = str(payload.get('cwd') or os.getcwd())

    # Only active in scoped repos
    if not is_repo_enabled(cwd):
        return 0

    # Only intercept Bash tool (Claude Code runtime)
    if tool != 'Bash':
        return 0

    cmd = str(payload.get('tool_input', {}).get('command', ''))
    if 'git commit' not in cmd:
        return 0

    # Extract -m message
    msg_match = re.search(r'-m\s+["\']([^"\']+)["\']', cmd)
    if not msg_match:
        return 0
    message = msg_match.group(1)

    if not ISSUE_RE.search(message):
        branch = get_branch()
        branch_issue = BRANCH_ISSUE_RE.search(branch)
        hint = f' (branch suggests #{branch_issue.group(1)})' if branch_issue else ''
        return block(
            f'Commit message must reference a GitHub issue #N{hint}.\n'
            f'Example: feat(scope): description #123'
        )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
