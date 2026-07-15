---
name: Worktree Tool Boundary
description: >
  All teams: use shell commands (not file-editing tools) for any path outside
  the registered workspace. Prevents client-facing authorization dialogs.
applyTo: "**"
---
# Worktree Tool Boundary — All Teams

_Refs: #3243 (self-anneal), #3242 (gh-cli-first)_
_Governance: `research/concurrent-agent-worktrees-2026-04-24.md`_

## Binding rule

**File-editing tools are permitted ONLY inside the registered workspace path.**

> Registered workspace: the path declared in the IDE/runtime workspace config
> (e.g. `/home/curtisfranks/devenv-ops-antigravity`).
> Git worktrees live at sibling paths like `devenv-ops-2826` and are
> **outside** the workspace.

| Path | Permitted | Forbidden |
|------|-----------|-----------|
| Inside registered workspace | All file-editing tools | — |
| Git worktree outside workspace | `run_command` shell only | `view_file`, `replace_file_content`, `multi_replace_file_content`, `write_to_file` |

## Why

File-editing tools on non-workspace paths trigger a **VS Code "Allow in
Workspace?"** authorization dialog on every call. This is client-arbitration
friction — the client must never be interrupted by internal operator tooling
decisions (G1, G4).

## Shell equivalents (use these for worktrees)

```bash
# Read            →  cat file.js  OR  sed -n 'Lstart,Lendp' file.js
# Edit line       →  sed -i 's/old/new/' file.js
# Edit block      →  patch -p1 < change.patch
# Write new file  →  cat > file.js << 'EOF' … EOF
# Append          →  echo 'line' >> file.js
```

## Pre-call checklist (any file-editing tool)

1. Does the target path start with the registered workspace root?
   - **Yes** → file-editing tool is OK.
   - **No** → stop; use a shell command via `run_command` instead.
2. Creating a `git worktree add`? All subsequent edits to that worktree must
   use shell commands, not file-editing tools.

## Scope

Applies to: **Antigravity (Gemini/Claude), Copilot, Claude Code, Codex** —
all agents operating in any Megingjord worktree.

See `research/concurrent-agent-worktrees-2026-04-24.md` for the concurrent
worktree safety model and `AGENTS.md` for the dedicated-worktree invariant.
