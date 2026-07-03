---
applyTo: "dashboard/**,**/*.html,**/*.css"
---

# Visual QA Governance for Web Repos

## Rule

For repositories classified as `website-static` or `web-app`:

1. **No release tag** (`git tag`) is permitted until `visual_qa` is recorded in governance state.
2. **No stop/completion claim** is permitted until `visual_qa` is in the admin_ops checklist.

## Required visual QA process

Before any release:

1. Start dashboard server (`npm start`)
2. Run Playwright E2E tests with full-page screenshot capture
3. Visually inspect the screenshot artifact for:
   - All panels render with content (no blank/collapsed sections)
   - Status badges are legible and color-coded
   - Text contrast meets WCAG 4.5:1 minimum
   - Controls (buttons, toggles) are visible and labeled
4. Record evidence:
   ```bash
   python3 hooks/scripts/visual_qa_record.py <cwd> <url> fullPage pass
   ```
5. Include evidence block in commit/release notes

## Evidence block format

```
VISUAL_QA_EVIDENCE
url: <inspected URL>
capture: <viewport|fullPage>
verdict: <pass|fail>
defects: <none or list>
```

## Enforcement points

- `pretool_guard.py`: blocks `git tag` when `visual_qa` is False
- `stop_checks.py`: includes `visual_qa` in admin completion gate
- `state_store.py`: tracks `visual_qa` in `admin_ops`

## Trigger

This instruction applies whenever HTML/CSS/JS files are modified.
