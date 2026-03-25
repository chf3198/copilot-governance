#!/usr/bin/env bash
# install.sh — Bootstrap copilot-governance on a new machine
#
# Usage: git clone git@github.com:chf3198/copilot-governance.git ~/copilot-governance
#        cd ~/copilot-governance && bash install.sh
#
# What it does:
#   1. Symlinks ~/.copilot/ → this repo directory
#   2. Merges required VS Code settings into settings.json
#   3. Optionally configures BYOK API keys via VS Code
#
# Safe to re-run — idempotent checks on every step.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
COPILOT_LINK="$HOME/.copilot"
VSCODE_SETTINGS="$HOME/.config/Code/User/settings.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { printf "${GREEN}[✓]${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}[!]${NC} %s\n" "$1"; }
err()  { printf "${RED}[✗]${NC} %s\n" "$1"; }
info() { printf "${BLUE}[i]${NC} %s\n" "$1"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          Copilot Governance System — Installer              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Symlink ~/.copilot/ → this repo ───────────────────────────

info "Step 1: Linking ~/.copilot/ → $REPO_DIR"

if [[ -L "$COPILOT_LINK" ]]; then
    CURRENT_TARGET="$(readlink -f "$COPILOT_LINK")"
    if [[ "$CURRENT_TARGET" == "$REPO_DIR" ]]; then
        log "~/.copilot/ already symlinked to this repo"
    else
        warn "~/.copilot/ points to $CURRENT_TARGET — updating to $REPO_DIR"
        ln -sfn "$REPO_DIR" "$COPILOT_LINK"
        log "Symlink updated"
    fi
elif [[ -d "$COPILOT_LINK" ]]; then
    # Existing directory — back it up, then symlink
    BACKUP="$HOME/.copilot.backup.$(date +%Y%m%d-%H%M%S)"
    warn "~/.copilot/ is a real directory — backing up to $BACKUP"
    mv "$COPILOT_LINK" "$BACKUP"
    ln -sfn "$REPO_DIR" "$COPILOT_LINK"
    log "Backed up existing dir and created symlink"
    info "Review $BACKUP and merge any unique content back into the repo"
else
    ln -sfn "$REPO_DIR" "$COPILOT_LINK"
    log "Created symlink ~/.copilot/ → $REPO_DIR"
fi

# Verify subdirectories exist
for dir in instructions skills agents hooks hooks/scripts; do
    if [[ ! -d "$REPO_DIR/$dir" ]]; then
        mkdir -p "$REPO_DIR/$dir"
        warn "Created missing directory: $dir"
    fi
done

# Ensure hook scripts are executable
chmod +x "$REPO_DIR"/hooks/scripts/*.py 2>/dev/null || true
log "Hook scripts marked executable"

# ─── Step 2: Merge VS Code settings ────────────────────────────────────

info "Step 2: Configuring VS Code settings"

if [[ ! -f "$VSCODE_SETTINGS" ]]; then
    warn "VS Code settings.json not found at $VSCODE_SETTINGS"
    warn "Create it after installing VS Code, then re-run this script"
else
    # Use python3 to safely merge JSON settings (handles trailing commas, JSONC comments)
    python3 - "$VSCODE_SETTINGS" <<'PYEOF'
import json
import re
import sys
from pathlib import Path

settings_path = Path(sys.argv[1])
raw = settings_path.read_text()

# Proper JSONC stripping: respect string boundaries (// inside URLs must survive)
result = []
i = 0
in_string = False
escape_next = False
while i < len(raw):
    ch = raw[i]
    if escape_next:
        result.append(ch); escape_next = False; i += 1; continue
    if in_string:
        result.append(ch)
        if ch == '\\': escape_next = True
        elif ch == '"': in_string = False
        i += 1; continue
    if ch == '"':
        in_string = True; result.append(ch); i += 1; continue
    if ch == '/' and i + 1 < len(raw) and raw[i+1] == '/':
        while i < len(raw) and raw[i] != '\n': i += 1
        continue
    if ch == '/' and i + 1 < len(raw) and raw[i+1] == '*':
        i += 2
        while i + 1 < len(raw) and not (raw[i] == '*' and raw[i+1] == '/'): i += 1
        i += 2; continue
    result.append(ch); i += 1
cleaned = ''.join(result)
cleaned = re.sub(r',(\s*[}\]])', r'\1', cleaned)
cleaned = re.sub(r'^\s*,\s*$', '', cleaned, flags=re.MULTILINE)

try:
    settings = json.loads(cleaned)
except json.JSONDecodeError as e:
    print(f"[!] Could not parse settings.json: {e}", file=sys.stderr)
    print("[!] Skipping settings merge — fix settings.json manually", file=sys.stderr)
    sys.exit(0)

# Required settings for governance system
required = {
    "chat.instructionsFilesLocations": {"~/.copilot/instructions": True},
    "chat.agentSkillsLocations": {
        "~/.copilot/skills": True,
        ".github/skills": True,
        ".claude/skills": True,
    },
    "chat.agentFilesLocations": {
        "~/.copilot/agents": True,
        ".github/agents": True,
    },
    "chat.hookFilesLocations": {
        "~/.copilot/hooks": True,
        ".github/hooks": True,
    },
    "chat.plugins.enabled": True,
    "github.copilot.chat.copilotMemory.enabled": True,
    "github.copilot.chat.tools.memory.enabled": True,
    "github.copilot.chat.organizationCustomAgents.enabled": True,
    "github.copilot.chat.organizationInstructions.enabled": True,
    "chat.useAgentSkills": True,
    "chat.useAgentsMdFile": True,
    "chat.useClaudeMdFile": True,
    "chat.useCustomAgentHooks": False,  # Enable once agent-scoped hooks mature
    "github.copilot.chat.codeGeneration.useInstructionFiles": True,
}

changed = False
for key, value in required.items():
    if key not in settings:
        settings[key] = value
        print(f"[+] Added: {key}")
        changed = True
    elif isinstance(value, dict) and isinstance(settings[key], dict):
        for subkey, subval in value.items():
            if subkey not in settings[key]:
                settings[key][subkey] = subval
                print(f"[+] Added {subkey} to {key}")
                changed = True
    # Don't overwrite existing values for simple settings

if changed:
    # Write back with clean formatting
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    print("[✓] VS Code settings updated")
else:
    print("[✓] VS Code settings already configured")
PYEOF

    log "Settings check complete"
fi

# ─── Step 3: BYOK reminder ─────────────────────────────────────────────

info "Step 3: Multi-model API keys"
echo ""
echo "  To add Anthropic, OpenRouter, or other model providers:"
echo "  1. Open VS Code"
echo "  2. Command Palette → 'Chat: Manage Language Models' → 'Add Models'"
echo "  3. Select your provider and enter your API key"
echo "  4. Keys are stored in VS Code's secure credential storage (not in files)"
echo ""
warn "NEVER store API keys in this repo, .env files, or settings.json"

# ─── Step 4: Settings Sync reminder ────────────────────────────────────

info "Step 4: Settings Sync"
echo ""
echo "  To sync VS Code settings across machines:"
echo "  1. Open VS Code → gear icon → 'Turn on Settings Sync...'"
echo "  2. Sign in with your GitHub account (chf3198)"
echo "  3. Check: Settings, Extensions, Keyboard Shortcuts, UI State"
echo ""
echo "  Settings Sync syncs the location REFERENCES (settings.json)."
echo "  This repo syncs the CONTENT (instructions, skills, agents, hooks)."
echo "  Together they provide complete cross-machine governance."

# ─── Done ───────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Installation Complete                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  ~/.copilot/ → $REPO_DIR"
echo "║  7 instructions │ 18 skills │ 4 agents │ 4 hooks          ║"
echo "║                                                            ║"
echo "║  To update: cd ~/copilot-governance && git pull            ║"
echo "║  Agents: select from agents dropdown in Chat view          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
