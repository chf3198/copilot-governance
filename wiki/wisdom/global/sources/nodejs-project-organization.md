---
title: Node.js Project Organization
type: source
created: 2026-04-23
updated: 2026-04-30
tags: [nodejs, project-structure]
status: active
---
# Node.js Project Organization Patterns

## Sources

- Uptime Kuma: https://github.com/louislam/uptime-kuma
- Homepage (gethomepage): https://github.com/gethomepage/homepage
- Node.js best practices: https://github.com/goldbergyoni/nodebestpractices
- See also: wiki/sources/nodejs-install-patterns.md

---

## Folder Organization Patterns

### Layer-Based (traditional, anti-pattern for large projects)

```
src/
  controllers/
  models/
  services/
  utils/
```

Problem: a single feature change touches 4+ folders.

### Feature-Based (preferred for maintainability)

```
src/
  fleet/
    fleet.js
    fleet.css
    fleet.test.js
  devices/
    devices.js
    devices.css
  shared/
    utils.js
    api.js
```

Benefit: all files for a feature are colocated.

### Static Dashboard Pattern (Homepage-inspired)

```
public/          # Static assets served directly
src/             # Feature modules
  widgets/
  integrations/
  core/
docs/            # Documentation source
scripts/         # Dev/build/deploy tooling
tests/           # E2E + unit tests
```

---

## File Naming Conventions

- Use `kebab-case` for files: `fleet-panel.js` not `FleetPanel.js`
- Match module name to feature name: `fleet.js` exports fleet functions
- Configuration files at root: `package.json`, `.eslintrc`, `.prettierrc`
- Separate tool scripts to `scripts/` — never in `src/`
- One concern per file; files over 100 lines signal split opportunity


