#!/usr/bin/env python3
"""SessionStart hook: inject repo-aware governance context.

Detects repo type, signals, and pending governance gaps to front-load
awareness of which skills and protocols apply.
"""
import json
import os
import sys
from pathlib import Path


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    cwd = Path(payload.get("cwd") or os.getcwd())
    signals = []
    gaps = []

    # Detect repo features
    if (cwd / ".github" / "workflows").exists():
        signals.append("CI-workflow-repo")
    if (cwd / "vscode-extension").exists() or (cwd / "package.json").exists():
        signals.append("node-or-extension-repo")
    if (cwd / "README.md").exists():
        signals.append("readme-present")
    if (cwd / "CHANGELOG.md").exists() or (cwd / "vscode-extension" / "CHANGELOG.md").exists():
        signals.append("changelog-present")

    # Check community health gaps
    for fname in ["CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "SUPPORT.md"]:
        found = (cwd / fname).exists() or (cwd / ".github" / fname).exists()
        if not found:
            gaps.append(f"missing:{fname}")

    # Check for CODEOWNERS
    if not (cwd / ".github" / "CODEOWNERS").exists() and not (cwd / "CODEOWNERS").exists():
        gaps.append("missing:CODEOWNERS")

    context_parts = [
        "Global standards active: root-cause first, evidence before claims, "
        "secret-safe packaging, version integrity, docs-sync on behavior/config changes.",
        f"Repo signals: {', '.join(signals) if signals else 'none-detected'}.",
    ]

    if gaps:
        context_parts.append(f"Community health gaps: {', '.join(gaps)}.")

    context_parts.append(
        "Post-merge governance: after any PR merge or deploy that changes behavior, "
        "run the post-merge checklist (CHANGELOG, README sync, repo-profile-governance, "
        "docs-drift-maintenance, learnings). Do not end the task until these are addressed."
    )

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
