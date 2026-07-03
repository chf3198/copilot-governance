---
title: "VS Code Copilot allow prompts 2026-05-05"
type: source
created: 2026-05-05
updated: 2026-05-06
tags: [vscode, copilot, workspace-trust, approvals]
sources: [raw/articles/vscode-copilot-allow-prompts-2026-05-05.md]
related: ["[[workspace-write-boundary-discipline]]", "[[wiki-pattern]]"]
status: draft
---

# VS Code Copilot allow prompts 2026-05-05

## Summary
Workspace-trust path boundaries and agent approval settings are the two main drivers of repeated "Allow" interruptions. The stable no-prompt strategy is to keep writes inside the trusted workspace path, avoid `/tmp` writes, and avoid direct edits to external runtime folders.

## Key findings

- Workspace Trust is path-oriented and shared with the Agents app.
- `Default Approvals` prompts more often than `Bypass Approvals`/`Autopilot`.
- `chat.permissions.default` can persist preferred approval behavior.
- `chat.tools.terminal.blockDetectedFileWrites` supports `outsideWorkspace` safety gates.
- Sensitive-file review can remain strict via `chat.tools.edits.autoApprove`.

## Repo policy distilled

1. Write only under workspace root.
2. Never edit runtime homes directly from this repo session.
3. Never emit agent artifacts to `/tmp` in this repo session.
4. Use source-of-truth repo + deploy scripts.
5. Keep sensitive-file review enabled.

Source: raw/articles/vscode-copilot-allow-prompts-2026-05-05.md
