---
title: "Workspace write-boundary discipline"
type: concept
created: 2026-05-05
updated: 2026-05-06
tags: [vscode, copilot, governance, safety]
sources: ["[[vscode-copilot-allow-prompts-2026-05-05]]"]
related: ["[[wiki-pattern]]", "[[governance-enforcement]]"]
status: draft
---

# Workspace write-boundary discipline

## Summary
For autonomous agent sessions, keep all writes inside the trusted workspace root to avoid trust prompts and approval interruptions. Route runtime changes through source repositories and deployment workflows, not direct edits to runtime home directories, and avoid `/tmp` write targets during repo work.

## Rules

1. Treat workspace root as the hard write boundary.
2. Refuse direct writes to external runtime homes during coding sessions.
3. Refuse `/tmp` write paths for agent-created artifacts in this repo.
4. Use task/PR workflow to propagate changes downstream.
5. Keep high-friction review rules for sensitive files.

## Related

See [[vscode-copilot-allow-prompts-2026-05-05]] and [[governance-enforcement]].
