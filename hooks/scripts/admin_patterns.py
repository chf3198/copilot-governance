#!/usr/bin/env python3
"""Shared regex patterns and utility functions for hook scripts."""
from __future__ import annotations

import re
from typing import Any, Iterable


def iter_strings(value: Any) -> Iterable[str]:
    """Recursively yield all string values from nested dicts/lists."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from iter_strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from iter_strings(v)


_PATH_PARAM_KEYS = frozenset({
    "file_path", "filePath", "path", "target_file", "destination",
    "notebook_path", "notebookPath",
    "TargetFile", "targetFile",  # Antigravity write_to_file/replace_file_content (#2585)
})
_COLLECTION_KEYS = frozenset({"replacements", "items"})


def iter_paths(tool_input: Any) -> Iterable[str]:
    """Yield only path-type parameter values from tool input.

    Reads known path-key names (file_path, filePath, etc.) but skips content
    fields like new_string/old_string to prevent false-positive path denials
    when content happens to contain path-like substrings. Refs #2371 AC1.
    """
    if not isinstance(tool_input, dict):
        return
    for k, v in tool_input.items():
        if k in _PATH_PARAM_KEYS and isinstance(v, str):
            yield v
        elif k in _COLLECTION_KEYS and isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    for pk in _PATH_PARAM_KEYS:
                        if pk in item and isinstance(item[pk], str):
                            yield item[pk]


SECRET_FILE_RE = re.compile(
    r"(^|/)(\.env(\..*)?|id_rsa|id_ed25519|.*\.pem|.*\.key)$"
)
DANGEROUS_CMD_RE = re.compile(
    r"\brm\s+-rf\s+/(\s|$)|\bmkfs\b|\bdd\s+if=|\bDROP\s+TABLE\b",
    re.IGNORECASE,
)

RE_GIT_COMMIT = re.compile(r"\bgit\s+(?:-c\s+\S+\s+)*commit\b")
RE_GIT_PUSH = re.compile(r"\bgit\s+push\b")
RE_PR_CREATE = re.compile(r"\bgh\s+pr\s+create\b")
RE_PR_CHECKS = re.compile(r"\bgh\s+pr\s+checks\b")
RE_PR_MERGE = re.compile(r"\bgh\s+pr\s+merge\b")
RE_VSCE_SHOW = re.compile(r"\b(vsce\s+show|npx\s+vsce\s+show)\b")
RE_VSCE_PUBLISH = re.compile(r"\b(vsce\s+publish|npx\s+vsce\s+publish)\b")
RE_RELEASE_INTEGRITY = re.compile(
    r"release-integrity-check\.sh\s+--post-publish"
)
RE_GH_RELEASE_CREATE = re.compile(r"\bgh\s+release\s+create\b")
RE_GH_ISSUE_CLOSE = re.compile(r"\bgh\s+issue\s+close\b")
RE_GH_ISSUE_CREATE = re.compile(r"\bgh\s+issue\s+create\b")
RE_GIT_TAG = re.compile(r"\bgit\s+tag\b")


# --- #3265: genuine-ship push accounting for the G-15 blast-radius counter ---
# A push counts toward the session push limit ONLY if it is a real, successful
# code-shipping push. Branch deletions, dry-runs, and pushes the remote/pre-push
# gate rejected are not real ships and must not drift the counter (false halt).
_RE_PUSH_DELETE = re.compile(
    r"\bgit\s+push\b[^\n]*?(?:\s(?:--delete|-d)\b|\s:[^\s]+)"
)
_RE_PUSH_DRYRUN = re.compile(r"\bgit\s+push\b[^\n]*?\s(?:--dry-run|-n)\b")
# Push-specific rejection markers only — never matches successful-push output,
# so a real ship is never accidentally suppressed (which would weaken the guard).
_RE_PUSH_REJECTED = re.compile(
    r"!\s*\[rejected\]|\[remote rejected\]|error:\s*failed to push|"
    r"updates were rejected|protected branch hook declined|"
    r"\bpush declined\b|pre-push hook declined|\bhook declined\b",
    re.IGNORECASE,
)
_EXIT_CODE_KEYS = ("exit_code", "exitCode", "returncode", "return_code", "code", "status")
_ERROR_FLAG_KEYS = ("is_error", "isError", "error")


def _push_outcome_failed(tool_response: Any) -> bool:
    """True only on a POSITIVE failure signal from the PostToolUse result.

    Unknown/absent outcome returns False (count it): over-counting halts safely,
    while under-counting risks missing a genuine runaway. Refs #3265.
    """
    if tool_response is None:
        return False
    if isinstance(tool_response, dict):
        for key in _EXIT_CODE_KEYS:
            val = tool_response.get(key)
            if isinstance(val, int) and val != 0:
                return True
        for key in _ERROR_FLAG_KEYS:
            if tool_response.get(key) is True:
                return True
    text = (tool_response if isinstance(tool_response, str)
            else "\n".join(iter_strings(tool_response)))
    return bool(_RE_PUSH_REJECTED.search(text))


def is_countable_push(cmd: str, tool_response: Any = None) -> bool:
    """Whether a command should increment the G-15 session push counter.

    Counts only a genuine, successful code-shipping `git push`. Excludes
    branch-deletes (`--delete`/`-d`/colon delete-refspec), dry-runs, and pushes
    rejected by the remote or pre-push gate. Refs #3265 (AC2/AC3).
    """
    if not RE_GIT_PUSH.search(cmd):
        return False
    if _RE_PUSH_DELETE.search(cmd) or _RE_PUSH_DRYRUN.search(cmd):
        return False
    if _push_outcome_failed(tool_response):
        return False
    return True



def required_admin_ops(flags: dict, repo_type: str,
                       research_clean_exempt: bool = False) -> list[str]:
    """Admin op keys required for completion. Stays in sync with
    stop_checks.check_admin_ops base/ext logic (#2444).

    #3266: `research_clean_exempt` is True only for a lane:research ticket whose working
    tree is clean — a report-only lane produces no PR/merge/publish by design, so ZERO
    Admin ops are required (suppresses the phantom "Admin baton incomplete" nag even when a
    stale code_touched flag lingers). The lane is resolved by the caller (stop_reminder);
    this function stays pure (flags, repo_type[, exempt]) and never reads the ticket lane.
    """
    if research_clean_exempt:
        return []
    base = (["commit", "push", "pr_create", "ci_green", "merge"]
            if flags.get("code_touched") else [])
    ext: list[str] = []
    if repo_type == "vscode-extension" and flags.get("extension_touched"):
        ext = ["publish", "release_integrity", "gh_release"]
    if flags.get("ui_touched"):
        ext.append("visual_qa")
    return base + ext
