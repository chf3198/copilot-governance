---
title: Dashboard Comparable Tools
type: source
created: 2026-04-23
updated: 2026-04-30
tags: [dashboard, research]
status: active
---
# Dashboard Comparable Tools: Marketability Patterns

## Sources

- Uptime Kuma: https://github.com/louislam/uptime-kuma (85.4k ⭐)
- Homepage: https://github.com/gethomepage/homepage (29.6k ⭐)

## Uptime Kuma

### Folder Structure

```
.github/   config/   db/   docker/   extra/
public/    server/   src/  test/
```

- Separates server-side (`server/`) from client assets (`src/`) cleanly
- `extra/` for third-party integrations
- `docker/` contains all Docker tooling — not mixed with app code

### Install Patterns

- **Docker one-liner**: `docker run -d --name uptime-kuma louislam/uptime-kuma`
- **Non-Docker**: `git clone && npm run setup && pm2 start server/server.js`
- `npm run setup` abstracts install complexity for non-Docker users
- PM2 for background/persistent process management

### Governance Files

- `AGENTS.md` — anti-AI-slop policy; sets contribution tone
- `CONTRIBUTING.md`, `SECURITY.md`, `compose.yaml`
- `.prettierrc.js`, `.stylelintrc`, `.editorconfig` — enforced formatting

### Tech Stack

- JS 56.3%, Vue 41.8%
- WebSocket + SPA architecture

---

## Homepage (gethomepage)

### Folder Structure

```
.github/  .vscode/  docs/   images/  k3d/  public/  src/
```

- `docs/` → dedicated documentation, powers gethomepage.dev via MkDocs
- `k3d/` → Kubernetes deployment examples (marketability signal)
- Feature-based `src/` structure (not layer-based)

### Install Patterns

- **Docker one-liner**: `docker compose up -d` with YAML volume mounts
- **From source**: `pnpm install && pnpm build && pnpm start`
- Docker label auto-discovery (zero-config integration)

### Governance Files

- Dedicated docs site (gethomepage.dev)
- Discord community, Crowdin i18n (40+ languages), Codecov badge
- Vitest tests, pre-commit hooks

### Feature Density

- 100+ service integrations
- 40+ language support
- Docker/Kubernetes auto-discovery

---

## Marketability Patterns to Apply

| Pattern | Uptime Kuma | Homepage | Apply to devenv-ops? |
|---|---|---|---|
| Docker one-liner install | ✅ | ✅ | Research |
| `npm run setup` wrapper | ✅ | — | Yes |
| Dedicated docs site | — | ✅ | Stretch goal |
| Screenshots in README | ✅ | ✅ | Yes |
| GitHub topics/badges | ✅ | ✅ | Yes |
| CONTRIBUTING.md | ✅ | ✅ | Yes |
| Formatted code (Prettier) | ✅ | ✅ | Yes |

## Signals for README

- Hero screenshot or GIF demo above the fold
- Clear "What is this?" in first 3 lines
- Quickstart block with single command
- Feature list with icons/emojis for scanability
- Badge row: version, license, CI status
