---
title: "Fleet Live Usage Indicator Options (2026)"
type: source
created: 2026-04-23
updated: 2026-04-23
tags: [fleet, monitoring, ollama, openclaw, tailscale]
sources:
  - research/fleet-live-usage-indicator-options-2026-04-23.md
related: ["[[windows-laptop]]", "[[penguin-1]]", "[[openclaw]]"]
status: draft
---

# Fleet Live Usage Indicator Options (2026)

## Summary

- Fleet models are not always loaded; runtime is on-demand (`ollama ps` empty at idle).
- Lowest-overhead visibility is terminal-first polling with bounded intervals.
- Remote view should default to tailnet SSH + persistent terminal session.
- Browser view is optional; app view is deferred due overhead/complexity.
- Bounded warm pools are supported via Ollama `keep_alive` (validated on both nodes).
- Remote-visible terminals depend on OS session model (Windows Session 0 vs user desktop).

## Options

1. Terminal indicator (preferred): local script + `tmux`.
2. Browser status page (optional): static page + JSON feed.
3. Native app/tray (deferred): highest maintenance and platform cost.

## Decision Direction

- Implement terminal-first indicator first.
- Use bounded `keep_alive` windows during active work instead of always-on model residency.
- Measure idle/active overhead before enabling browser mirror.
- Keep probes cheap (`/health/liveliness` for heartbeat, avoid expensive health calls).
- Use per-device startup hooks/tasks to launch visible terminals in user sessions.
- Use single-line redraw mode to avoid unbounded terminal scrollback growth.
- Use bounded stress scripts for UAT (`fleet-live-indicator-stress.sh`/`.js`).

## Next Steps

1. Implement prototype on windows-laptop and penguin-1.
2. Add remote attach playbook.
3. Update concept docs after measured validation.

Last updated: 2026-04-23