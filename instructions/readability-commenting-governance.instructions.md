---
applyTo: "dashboard/**/*.js,scripts/**/*.js,tests/**/*.js,hooks/scripts/**/*.sh"
---

# Readability & Commenting Governance

## Required Standards

1. **Formatting**
   - Use repository formatter command before commit.
   - Avoid manual formatting churn in unrelated files.

2. **Naming**
   - No ambiguous one-letter names except narrow local loops.
   - Name variables/functions by intent, not implementation detail.

3. **Function Complexity**
   - Keep functions small and focused.
   - Split mixed-responsibility functions into helpers.

4. **Magic Numbers**
   - Extract non-obvious constants to named identifiers.
   - Inline only obvious literals (`0`, `1`, small local bounds).

5. **Commenting/JSDoc**
   - JSDoc required for exported/public symbols.
   - Inline comments explain *why*, not restate *what*.
   - Document non-obvious error handling and retry behavior.

6. **Suppressions**
   - Keep suppressions as narrow as possible.
   - Include rationale in adjacent comment.

## Rollout Model

- Stage 1: warn + autofix for legacy files.
- Stage 2: block regressions on touched files.
- Stage 3: enforce strict gates repo-wide after baseline reduction.

## Validation

- `npm run lint:readability`
- `npm run lint:js`
- formatter check command

## Language-Specific Notes

- **JavaScript**: exported functions/classes require JSDoc with params/returns when applicable.
- **Shell**: include intent comments before destructive operations and retries.
- **Markdown**: prefer concise sections, explicit action items, and no stale TODO lists.

## Diff-Aware Enforcement (#1434)

Stage 2 of the rollout model ("block regressions on touched files") is implemented by the
**diff-aware readability gate**. Rather than failing on an absolute repo-wide warning count —
which drifts upward and forces the threshold to be ratcheted until any unrelated PR re-breaks it —
the gate compares each changed JS file against its base revision and fails only on **net-new**
warnings.

- Command: `npm run lint:readability:diff` (= `lint-readability.js --changed-only --max-warnings=486`).
- Scope: files changed versus the merge-base with `main` (`<base>...HEAD` plus working tree),
  filtered to `dashboard/js/**` and `scripts/**` `.js` files.
- Gate: fails when the summed per-file positive delta (current warnings − base warnings) is `> 0`.
  An improvement in one file never offsets a regression in another.
- New files count against a base of zero; renamed/absent base paths are treated as new (no crash).
- Resilience (G6): if the base ref is unavailable (shallow CI checkout, bogus base), the gate emits
  an advisory and falls back to the absolute `--max-warnings` ceiling — never a silent fail-open.
- Surfaces: local pre-push (`lefthook.yml`) and CI (`.github/workflows/lint.yml`, `fetch-depth: 0`).
- The absolute gate (`npm run lint:readability:ci`) is retained as the fallback ceiling and for
  explicit whole-repo audits.
