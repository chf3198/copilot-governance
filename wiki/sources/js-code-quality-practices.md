---
title: JS Code Quality Practices
type: source
created: 2026-04-23
updated: 2026-04-30
tags: [javascript, code-quality, linting]
status: active
---
# JavaScript Code Quality Practices

## Sources

- clean-code-javascript (94.3k ⭐): https://github.com/ryanmcdermott/clean-code-javascript
- MDN Web Docs JS Style Guide: https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Code_style_guide/JavaScript

---

## Variables

- Use meaningful, pronounceable names (3–10 chars is a hint)
- Use `const` by default; `let` when reassigning; never `var`
- One variable per line
- Use camelCase for primitives; PascalCase for classes
- Avoid articles/possessives: `car` not `myCar`
- Named constants for magic numbers: `MILLISECONDS_PER_DAY` not `86400000`
- Use template literals for interpolation; avoid string concat
- No type coercion shortcuts: `Number(x)` not `+x`

## Functions

- ≤2 parameters ideally; use destructuring for 3+
- Single responsibility: one function does one thing
- Name says what it does: `addMonthToDate` not `addToDate`
- Single level of abstraction per function
- Remove dead code — it belongs in git history, not source
- No flag parameters (they mean the function does 2 things)
- Default parameters instead of `||` coercion
- Use function declarations over function expressions
- Arrow functions for callbacks; avoid assigning arrows to identifiers
- Use implicit return in arrow functions when possible

## Code Structure

- Prefer `for...of` or `forEach` over `for (;;)` loops
- No `for...in` on arrays
- Use `for...of` or higher-order functions: `map`, `filter`, `reduce`, `find`
- Encapsulate complex conditionals in named functions
- Avoid negative conditionals (`isDOMNodePresent` not `isDOMNodeNotPresent`)
- After `if (condition) return`, don't add `else` — continue inline
- Always use braces with control flow, even single-line

## Objects / Data

- Use object literals `{}` not `new Object()`
- Use ES6 class syntax not prototype chains
- Use shorthand properties: `{ name }` not `{ name: name }`
- Use `Object.hasOwn()` not `hasOwnProperty()`
- Use `Object.assign()` for default object merging

## Comments

- Comments are an apology, not a requirement — good code self-documents
- Only comment business logic complexity
- No commented-out code (use git history)
- No journal comments (use `git log`)
- No positional markers (`////...////`)
- Comments go on separate line before the code they describe

## Error Handling

- Never silently ignore caught errors
- `console.error` for errors, `console.log` for output
- Use `async/await` over promise chains for readability
- Use `try/catch` for recoverable errors; let non-recoverable bubble up

## SOLID Principles (applied to JS)

- **SRP**: Only one reason for a module to change
- **OCP**: Open for extension, closed for modification
- **DIP**: Depend on abstractions, not concrete implementations

## Formatting Automation

- Use Prettier — eliminates style debates
- Use ESLint for correctness
- Use `.editorconfig` for cross-editor consistency
- Consistent capitalization: `SCREAMING_SNAKE` for constants, `camelCase`
  for variables, `PascalCase` for classes

## Applying to Static HTML/JS Projects

For no-build-step projects (like devenv-ops dashboard):

- Organize JS by feature/concern, not by type
- Extract shared utilities to a single `utils.js` or `helpers.js`
- Avoid inline event handlers in HTML — bind in JS
- Use `textContent` not `innerHTML` for text insertion (security)
- Prefer `fetch()` over XHR
