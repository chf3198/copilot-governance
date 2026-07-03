---
title: GitHub Integration
type: concept
created: 2026-04-14
updated: 2026-04-30
tags: [github, api, monitoring, dashboard]
related: ["[[context-flow]]", "[[model-routing]]"]
status: active
---

# GitHub Integration

## Overview

The dashboard monitors GitHub repository activity in real time
using the `gh` CLI, which provides authenticated API access
without managing tokens directly.

## Architecture

```
Dashboard Server → gh CLI → GitHub REST API → chf3198/devenv-ops
      │                                              │
      ▼                                              ▼
/api/github/summary              Issues, PRs, Actions, Branches
```

## API Endpoints Used

| Endpoint | Data | Permission |
|---|---|---|
| `repos/{owner}/{repo}` | Stars, forks, open issues | Public |
| `repos/{o}/{r}/issues` | Issues + labels, state | Issues:read |
| `repos/{o}/{r}/pulls` | PRs, merge status | Pull Requests:read |
| `repos/{o}/{r}/actions/runs` | Workflow runs | Actions:read |
| `repos/{o}/{r}/branches` | Branch list | Contents:read |

## Rate Limits

- **Authenticated PAT**: 5,000 requests/hour
- **gh CLI cache**: 60-second TTL reduces redundant calls
- **Dashboard poll**: Every 5 seconds, but GitHub endpoint
  is called less frequently due to caching

## Dashboard Panel

The **🐙 GitHub Activity** panel in the Ops view displays:
- Open issues / Open PRs / Merged PRs / Branch count
- Recent issues table (number, title, state badge)
- Recent PRs table (number, title, merged/open badge)
- Actions workflow runs (icon, name, branch, conclusion)
- Active branches as pill badges

## Security Notes

- No tokens stored in dashboard code
- `gh` CLI uses existing auth from `~/.config/gh/hosts.yml`
- Token scopes: `repo`, `workflow`, `read:org`, `project`
- Server-side only — browser never contacts GitHub directly
