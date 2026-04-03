---
name: Playwright MCP Low-Resource Routing
description: Apply low-resource defaults whenever Playwright MCP or Claude vision/browser automation is used.
applyTo: "**"
---

When the task involves Playwright MCP, browser automation, visual QA, screenshot analysis, or Claude vision:

1. Apply the `playwright-vision-low-resource` skill first.
2. Run preflight before browser actions:
   - `~/.gemini/antigravity/skills/playwright-vision-low-resource/scripts/preflight-playwright-mcp.sh`
3. Use bounded retries:
   - Maximum 2 retries for browser-context failures.
4. Prefer local constrained profile by default:
   - headless
   - workers=1
   - chromium-only
   - artifacts retained on failure/retry only
5. If browser context is unstable after 2 failures:
   - stop retry loop
   - switch to deterministic fallback (DOM/code inspection + CI gates)
   - mark visual verification deferred/manual if required.

Do not commit user-level skills into repositories.
