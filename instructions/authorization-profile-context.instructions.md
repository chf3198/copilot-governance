---
name: Authorization Profile Context
description: Injects the active authorization profile into session startup so all operations are scoped by capability constraints. Default is owner; override via CLI/env.
applyTo: "**"
---

# Authorization Profile Context

## Activation

On every session start, the active authorization profile is loaded and injected into:
1. Startup instructions/prompt context
2. Session metadata (available to tooling)
3. Runtime environment for constraints enforcement

## Profile Detection

Authorization profile is resolved in precedence order:
- **CLI**: `--profile=<owner|guarded|restricted>`
- **Environment**: `MEGINGJORD_AUTH_PROFILE=<value>`
- **Config**: `~/.copilot/config.json` or `~/.codex/config.toml` defaultProfile field
- **Fallback**: `owner` (full authority)

## Canonical Profiles

### owner
Full authority; all capabilities enabled:
- `install`: ✅ permitted
- `upgrade`: ✅ permitted
- `privileged`: ✅ permitted
- `execute_local`: ✅ permitted
- `execute_remote`: ✅ permitted

### guarded
Reduced install authority; suitable for validation/review roles:
- `install`: ❌ blocked
- `upgrade`: ✅ permitted
- `privileged`: ❌ blocked
- `execute_local`: ✅ permitted
- `execute_remote`: ✅ permitted

### restricted
Local-only execution; audit/sandbox mode:
- `install`: ❌ blocked
- `upgrade`: ❌ blocked
- `privileged`: ❌ blocked
- `execute_local`: ✅ permitted
- `execute_remote`: ❌ blocked

## Prompt Injection

All sessions include this in the initial context:

```
Authorization Profile: <profile>
Active Capabilities:
  - install: <boolean>
  - upgrade: <boolean>
  - privileged: <boolean>
  - execute_local: <boolean>
  - execute_remote: <boolean>
Activation Source: <cli|env|config|default>
Override: --profile=<owner|guarded|restricted> or MEGINGJORD_AUTH_PROFILE=<value>
```

## Session Metadata

Session metadata exposed as `$MEGINGJORD_SESSION_PROFILE` JSON:

```json
{
  "profile": "owner",
  "capabilities": { ... },
  "source": "config",
  "timestamp": "2026-05-16T14:00:00Z",
  "precedence": ["cli", "env", "config", "default"]
}
```

## Enforcement

- Scripts/tools that require elevated capability will call `authorization-profile.js` to check active profile before proceeding
- Privilege escalation across profile boundaries requires explicit ticket/approval
- Default behavior is **deny by default** for privileged operations when profile restricts capability

## Override Process

1. Run with explicit override: `--profile=owner` or `MEGINGJORD_AUTH_PROFILE=owner`
2. For persistent override, set in `~/.copilot/config.json` or `~/.codex/config.toml`
3. No runtime profile changes mid-session; restart required for new profile activation
