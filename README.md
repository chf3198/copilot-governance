# Copilot Governance System

Portable, cross-machine governance system for VS Code Copilot. Ensures every Copilot chat session follows the same optimally intelligent workflows, procedures, and best practices regardless of repo or project.

## What This Contains

| Directory | Purpose | Loaded Via |
|---|---|---|
| `instructions/` | 7 always-on instruction files — engineering standards, governance rules, operator identity | `chat.instructionsFilesLocations` |
| `skills/` | 18 on-demand expert skills — GitHub ops, release integrity, security, docs drift | `chat.agentSkillsLocations` |
| `agents/` | 4 custom agents — governance auditor, release reviewer, security scanner, planner | `chat.agentFilesLocations` |
| `hooks/` | 4 lifecycle hooks — session context injection, pre-tool guards, post-tool reminders, stop gate | `chat.hookFilesLocations` |

## Quick Install (New Machine)

```bash
git clone git@github.com:chf3198/copilot-governance.git ~/copilot-governance
cd ~/copilot-governance
bash install.sh
```

The install script:
1. Symlinks `~/.copilot/` → this repo (so `git pull` updates everything)
2. Merges required VS Code settings into your `settings.json`
3. Prompts for API keys (Anthropic, OpenRouter) — stored securely, never in the repo

## Manual Install

If you prefer not to run the script:

1. Clone this repo anywhere
2. Create symlink: `ln -sfn /path/to/copilot-governance ~/.copilot`
3. Add to your VS Code `settings.json`:
```json
{
  "chat.instructionsFilesLocations": { "~/.copilot/instructions": true },
  "chat.agentSkillsLocations": { "~/.copilot/skills": true },
  "chat.agentFilesLocations": { "~/.copilot/agents": true },
  "chat.hookFilesLocations": { "~/.copilot/hooks": true },
  "chat.plugins.enabled": true,
  "github.copilot.chat.copilotMemory.enabled": true
}
```

## Update

```bash
cd ~/copilot-governance && git pull
```

Changes take effect immediately — VS Code watches the file system.

## Multi-Model Support

After install, add your API keys via VS Code:
1. Open Command Palette → `Chat: Manage Language Models` → `Add Models`
2. Select provider (Anthropic, OpenRouter, etc.)
3. Enter your API key (stored in VS Code's secure storage, never in files)

Custom agents specify preferred models in their frontmatter:
```yaml
model: Claude Opus 4 (copilot)
```

## Custom Agents

| Agent | Purpose | Invoke |
|---|---|---|
| **Governance Auditor** | Post-merge CHANGELOG/README/health/drift audit | Select from agents dropdown |
| **Release Reviewer** | Pre-release version integrity and artifact safety | Select from agents dropdown |
| **Security Scanner** | Credential exposure scan across files/history/artifacts | Select from agents dropdown |
| **Planner** | Read-only research and implementation planning | Select from agents dropdown |

## Architecture

```
Settings Sync (via GitHub account)
├── Syncs: VS Code settings, extensions, keybindings, profiles
├── These settings REFERENCE ~/.copilot/ paths
└── Does NOT sync ~/.copilot/ contents itself

This Repo (git clone)
├── instructions/   → always-on rules injected into every chat
├── skills/         → on-demand procedures loaded when relevant
├── agents/         → specialized personas with tool/model configs
└── hooks/          → deterministic lifecycle enforcement scripts

Together: Settings Sync ensures the REFERENCES are consistent;
          this repo ensures the CONTENT is consistent.
```

## Security

- **Never commit API keys, tokens, or credentials** to this repo
- The `.gitignore` blocks `.env`, `.pem`, `.key`, and private key files
- API keys are stored per-machine in VS Code's secure credential storage
- The `pretool_guard.py` hook blocks operations on secret-bearing files

## License

Private — personal use only.
