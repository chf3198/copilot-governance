#!/usr/bin/env python3
"""SessionStart hook: inject project-type adaptive governance context."""
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from governance_state import ensure_state, reset_state
from wiki_router import route_wiki_context
from wiki_wisdom import baton_protocol, governance_enforcement, post_merge_checklist


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    cwd = Path(payload.get("cwd") or os.getcwd())
    source = str(payload.get("source") or "")
    if source in {"new", "startup", "clear"}:
        state = reset_state(str(cwd))
    else:
        state = ensure_state(str(cwd))
    repo_type = state.get("repo_type", "generic")

    signals = []
    gaps = []

    if (cwd / ".github" / "workflows").exists():
        signals.append("CI-workflow-repo")
    if (cwd / "vscode-extension").exists() or (cwd / "package.json").exists():
        signals.append("node-or-extension-repo")
    if (cwd / "README.md").exists():
        signals.append("readme-present")
    if (cwd / "CHANGELOG.md").exists() or (cwd / "vscode-extension" / "CHANGELOG.md").exists():
        signals.append("changelog-present")
    if (cwd / "wiki").exists():
        signals.append("wiki-present")

    for fname in ["CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "SUPPORT.md"]:
        found = (cwd / fname).exists() or (cwd / ".github" / fname).exists()
        if not found:
            gaps.append(f"missing:{fname}")

    if not (cwd / ".github" / "CODEOWNERS").exists() and not (cwd / "CODEOWNERS").exists():
        gaps.append("missing:CODEOWNERS")

    if repo_type == "vscode-extension":
        profile = "Profile=vscode-extension: hard admin+release gates."
    elif repo_type in {"web-app", "website-static"}:
        profile = "Profile=web: hard admin gates+docs-drift checks."
    elif repo_type == "infra-automation":
        profile = "Profile=infra: hard admin gates+governance checks."
    else:
        profile = "Profile=generic: hard admin gates for code sessions."

    baton_msg = baton_protocol()
    standards_msg = governance_enforcement()
    postmerge_msg = post_merge_checklist()
    ANCHOR = (
        "GOVERNANCE ANCHOR (non-negotiable): "
        "1) One ticket per branch — feat/<N>-desc or fix/<N>-desc. "
        "2) Manager scope comment BEFORE any file edits. "
        "3) Commits MUST reference ticket (#N) — deny on missing. "
        "4) One branch = one ticket = one PR. No bundling. "
        "5) Baton sequence: Manager→Collaborator→Admin→Consultant. "
        "6) Goal order: Governance > Quality > Zero Cost > Privacy > Portability > Resilience > Throughput > Observability > Interoperability."
    )
    context_parts = [
        ANCHOR, baton_msg, standards_msg,
        f"Project type: {repo_type}.", profile,
        f"Signals: {', '.join(signals) if signals else 'none'}.",
    ]
    if gaps:
        context_parts.append(f"Health gaps: {', '.join(gaps)}.")
    context_parts.extend(route_wiki_context(cwd, repo_type, signals))
    context_parts.append(postmerge_msg)

    out = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": " ".join(context_parts),
        }
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
