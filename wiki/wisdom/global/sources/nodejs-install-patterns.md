---
title: Node.js Install Patterns
type: source
created: 2026-04-23
updated: 2026-04-30
tags: [nodejs, installation, toolchain]
status: active
---
# Node.js Ease-of-Install Patterns

## Sources

- Uptime Kuma: https://github.com/louislam/uptime-kuma
- Homepage (gethomepage): https://github.com/gethomepage/homepage
- See also: wiki/sources/nodejs-project-organization.md

---

## Install Tiers (best → least friction)

### Tier 1: Zero-Install

```bash
npx my-tool
```

- Requires npm publish; no global install needed; ideal for CLI tools

### Tier 2: One-Command Docker

```bash
docker compose up -d
```

- Self-contained; no host dependency management
- Used by Uptime Kuma and Homepage as primary install path

### Tier 3: Setup Script

```bash
git clone https://github.com/you/repo
npm run setup
npm start
```

- `npm run setup` hides `npm install` + init steps
- PM2 for persistence: `pm2 start server.js`

### Tier 4: Manual (avoid)

```bash
npm install && cp config.example.json config.json && node server.js
```

---

## package.json Script Conventions

```json
{
  "scripts": {
    "setup": "npm install && node scripts/init.js",
    "start": "node server.js",
    "dev":   "node --watch server.js",
    "lint":  "node scripts/lint.js",
    "test":  "node tests/run.js"
  }
}
```

- `setup` = single entry point for new contributors
- `start` = production mode; `dev` = watch/reload
- Document every script's purpose in README

---

## README Quickstart Block

```markdown
## Quick Start

### Docker (recommended)
docker compose up -d

### From source
git clone https://github.com/you/repo
npm run setup
npm start
```

---

## devenv-ops Opportunities

1. Add `npm run setup` (installs deps + creates default config)
2. Add `Dockerfile` + `compose.yaml` for Docker path
3. Add `.nvmrc` for Node version pinning
4. Verify clean-clone → setup → start works end-to-end
5. Add quickstart block to README above the fold
