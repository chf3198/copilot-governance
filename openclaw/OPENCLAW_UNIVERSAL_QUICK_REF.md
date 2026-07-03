# OpenClaw Universal System — Quick Reference

**Applies to**: Every VS Code Copilot agent chat on this machine

## Core Rule

Reusable OpenClaw strategy belongs in `~/.copilot`; repository docs are overlays, not the canonical source.

## Universal Flow

`CLASSIFY -> PRECHECK -> ROUTE -> EXECUTE -> OBSERVE -> VERIFY -> AUDIT`

## Shared Task Types

- `code-generation`
- `analysis`
- `reasoning-advanced`
- `documentation`
- `testing`

## Prefer OpenClaw When

- work is medium or heavy
- multiple files or systems are involved
- reasoning depth matters
- tests or browser runs are broad
- local device pressure is high

## Prefer Local When

- the edit is tiny and isolated
- verification is narrow and quick
- the repository has a stronger local-only constraint

## Three Checkpoints

1. Design
2. Implementation
3. Verification

## Global Assets

- Strategy: `/home/curtisfranks/.copilot/openclaw/OPENCLAW_UNIVERSAL_SYSTEM.md`
- Routing map: `/home/curtisfranks/.copilot/openclaw/task-router-profile-map.json`
- Skill: `/home/curtisfranks/.copilot/skills/openclaw-universal-system/SKILL.md`
- Bootstrap: `/home/curtisfranks/.local/bin/openclaw-bootstrap-repo /absolute/path/to/repo init`
