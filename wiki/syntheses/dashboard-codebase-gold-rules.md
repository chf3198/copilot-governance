---
title: Dashboard Codebase Gold Rules
type: synthesis
created: 2026-07-14
status: final
tags: [dashboard, quality, testing, alpine, playwright]
---

# Dashboard Codebase Gold Rules — Synthesis

Gold rules derived from deep codebase audit (Epic #290) and web
research on Alpine.js v3, Playwright, Core Web Vitals, and
static-site best practices.

## Executive Summary

The dashboard (40 JS files, 2,432 lines, Alpine.js v3) has
systemic quality gaps: global namespace pollution, silent error
swallowing, Alpine v2 API usage, and zero test infrastructure.
These 10 gold rules address every finding.

## Gold Rules

### 1. One Name, One Definition
Every global function/variable must be defined exactly once.
**Violated by**: `esc()` defined in render-panels.js AND
settings-panel.js. Last load wins silently.

### 2. Match Your Framework Version
Use only APIs from the loaded framework version.
**Violated by**: `el.__x.$data` (Alpine v2) in baton-filter.js.
Alpine v3 uses `Alpine.$data(el)`.

### 3. Never Swallow Errors Silently
Every `catch` block must log context: module name, operation,
and error message. Use `console.warn` (not `console.error`)
for non-fatal; `console.error` for fatal.
**Violated by**: 18+ catch blocks across all modules.

### 4. Isolate Parallel Failures
Use `Promise.allSettled()` instead of `Promise.all()` when
individual failures should not kill the batch.
**Violated by**: `refreshAll()` in app.js.

### 5. Initialize All Config Before Use
Any `window.__config` property must be set before first read.
**Violated by**: `__fleetConfig.openclawURL` never set.

### 6. Defer Non-Critical Scripts
Scripts that don't define symbols needed by inline Alpine
expressions should use `defer` or load at end-of-body.
**Violated by**: 39 of 40 script tags are synchronous.

### 7. Separate Pure Logic from DOM
Functions that compute, transform, or validate should be
pure (no DOM access). This enables unit testing without a
browser. Export via namespace object.

### 8. Namespace Global Symbols
Group related globals under a single namespace object:
`window.Dashboard = { esc, renderPanel, ... }`.
Reduces 170+ globals to ~5 namespace roots.

### 9. Test User-Visible Behavior
Playwright tests should use user-facing locators
(`getByRole`, `getByText`) not CSS selectors. Assert
outcomes users see, not implementation details.
Source: Testing Library guiding principles.

### 10. Configure Your Test Runner
A `playwright.config.js` must exist with: baseURL, timeout,
retries, reporter, and webServer config. Never rely on
CLI defaults.

## Priority Map

| Priority | Tickets | Impact |
|----------|---------|--------|
| P1 | CE2, CE3, CE5 | Console errors on load |
| P2 | CE4, CE6, CE7 | Debuggability & testing |
| P3 | CE8, CE9, CE10 | Long-term maintainability |

## Research Sources

- Alpine.js v3 docs: `Alpine.$data()` migration
- Web.dev Core Web Vitals: LCP, INP, CLS thresholds
- Playwright docs: best practices for E2E testing
- Testing Library: guiding principles (user-centric)
- MDN: script defer/async behavior

## Related

- Epic: #290 (Codebase Excellence & Testability Audit)
- Tickets: #291–#300
- Wiki: [[devenv-ops-enforcement-architecture]]


[devenv-ops-enforcement-architecture]: devenv-ops-enforcement-architecture.md "DevEnv Ops Enforcement Architecture"
