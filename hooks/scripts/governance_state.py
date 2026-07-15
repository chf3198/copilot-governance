#!/usr/bin/env python3
"""Shared governance state helpers — re-export facade.

Actual logic lives in admin_patterns, repo_detection,
state_store, and tool_activity. Import from this module
to maintain backward compatibility.
"""
# Re-export all public symbols for backward compatibility.
from admin_patterns import iter_strings  # noqa: F401
from repo_detection import (  # noqa: F401
    CODE_EXTS,
    DOC_EXTS,
    classify_path,
    detect_repo_type,
)
from state_store import (  # noqa: F401
    STATE_ROOT,
    ensure_state,
    load_state,
    reset_on_branch_change,
    reset_state,
    save_state,
    state_path,
)
from tool_activity import mark_tool_activity  # noqa: F401
