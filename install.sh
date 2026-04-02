#!/usr/bin/env bash
# install.sh — Bootstrap copilot-governance on a new machine (all platforms)
#
# Usage (one-liner):
#   curl -fsSL https://raw.githubusercontent.com/chf3198/copilot-governance/main/install.sh | bash
#
# Or manual:
#   git clone https://github.com/chf3198/copilot-governance.git ~/copilot-governance
#   cd ~/copilot-governance && bash install.sh
#
# What it does (idempotent — safe to re-run):
#   1. Clone repo to ~/copilot-governance if not already present
#   2. VS Code Copilot: symlink ~/.copilot/ → repo; merge settings.json
#   3. Google Antigravity: envsubst GEMINI.md → ~/.gemini/GEMINI.md; symlink skills/
#   4. Claude Code: envsubst CLAUDE.md → ~/.claude/CLAUDE.md; symlink skills/
#   5. Sync: install systemd user timer (pull every 15 min); enable linger
#
# After install, authenticate gh CLI once per machine:
#   gh auth login

# ─── Resolve repo dir BEFORE enabling strict mode ──────────────────────
# set -euo pipefail is deferred until AFTER this block on purpose.
# When piped via curl | bash, bash reads from stdin and BASH_SOURCE is
# either entirely unset or empty. Referencing it under set -u aborts
# immediately. Check it first without strict mode, then enable once we
# are guaranteed to be running from a real on-disk file path.
if [[ -z "${BASH_SOURCE[0]+x}" ]] || [[ -z "${BASH_SOURCE[0]}" ]]; then
    # Piped from curl — clone first, then re-exec from the clone
    REPO_DIR="$HOME/copilot-governance"
    if [[ ! -d "$REPO_DIR/.git" ]]; then
        echo "[i] Cloning copilot-governance to $REPO_DIR ..."
        git clone https://github.com/chf3198/copilot-governance.git "$REPO_DIR"
    fi
    exec bash "$REPO_DIR/install.sh"
fi

# Running from a real file from here onward — safe to enable strict mode.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export REPO_DIR  # needed by envsubst

COPILOT_LINK="$HOME/.copilot"
VSCODE_SETTINGS="$HOME/.config/Code/User/settings.json"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

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
echo "║         Copilot Governance System — Installer v2           ║"
echo "║         VS Code · Google Antigravity · Claude Code         ║"
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

# ─── Step 3: Google Antigravity ────────────────────────────────────────

info "Step 3: Configuring Google Antigravity"

GEMINI_DIR="$HOME/.gemini"
GEMINI_SKILLS_DIR="$GEMINI_DIR/antigravity/skills"
GEMINI_RULES="$GEMINI_DIR/GEMINI.md"

mkdir -p "$GEMINI_DIR/antigravity"

# Symlink skills into Antigravity
if [[ -L "$GEMINI_SKILLS_DIR" ]]; then
    log "~/.gemini/antigravity/skills/ already symlinked"
elif [[ -d "$GEMINI_SKILLS_DIR" ]]; then
    BACKUP="$GEMINI_SKILLS_DIR.backup.$(date +%Y%m%d-%H%M%S)"
    warn "~/.gemini/antigravity/skills/ is a real directory — backing up to $BACKUP"
    mv "$GEMINI_SKILLS_DIR" "$BACKUP"
    ln -sfn "$REPO_DIR/skills" "$GEMINI_SKILLS_DIR"
    log "Skills symlinked for Antigravity"
else
    ln -sfn "$REPO_DIR/skills" "$GEMINI_SKILLS_DIR"
    log "Created ~/.gemini/antigravity/skills/ → $REPO_DIR/skills"
fi

# Generate ~/.gemini/GEMINI.md from template (envsubst replaces ${REPO_DIR})
if [[ -f "$REPO_DIR/GEMINI.md" ]]; then
    if command -v envsubst &>/dev/null; then
        envsubst < "$REPO_DIR/GEMINI.md" > "$GEMINI_RULES"
        log "Generated ~/.gemini/GEMINI.md (${REPO_DIR} resolved)"
    else
        warn "envsubst not found — copying GEMINI.md template as-is (paths may need manual fix)"
        cp "$REPO_DIR/GEMINI.md" "$GEMINI_RULES"
        sed -i "s|\${REPO_DIR}|$REPO_DIR|g" "$GEMINI_RULES"
        log "Generated ~/.gemini/GEMINI.md (sed fallback)"
    fi
else
    warn "GEMINI.md template not found in repo — skipping Antigravity rules"
fi

# ─── Step 4: Claude Code ───────────────────────────────────────────────

info "Step 4: Configuring Claude Code"

CLAUDE_DIR="$HOME/.claude"
CLAUDE_SKILLS_DIR="$CLAUDE_DIR/skills"
CLAUDE_RULES="$CLAUDE_DIR/CLAUDE.md"

mkdir -p "$CLAUDE_DIR"

# Symlink skills into Claude Code
if [[ -L "$CLAUDE_SKILLS_DIR" ]]; then
    log "~/.claude/skills/ already symlinked"
elif [[ -d "$CLAUDE_SKILLS_DIR" ]]; then
    BACKUP="$CLAUDE_SKILLS_DIR.backup.$(date +%Y%m%d-%H%M%S)"
    warn "~/.claude/skills/ is a real directory — backing up to $BACKUP"
    mv "$CLAUDE_SKILLS_DIR" "$BACKUP"
    ln -sfn "$REPO_DIR/skills" "$CLAUDE_SKILLS_DIR"
    log "Skills symlinked for Claude Code"
else
    ln -sfn "$REPO_DIR/skills" "$CLAUDE_SKILLS_DIR"
    log "Created ~/.claude/skills/ → $REPO_DIR/skills"
fi

# Generate ~/.claude/CLAUDE.md from template
if [[ -f "$REPO_DIR/CLAUDE.md" ]]; then
    if command -v envsubst &>/dev/null; then
        envsubst < "$REPO_DIR/CLAUDE.md" > "$CLAUDE_RULES"
        log "Generated ~/.claude/CLAUDE.md (${REPO_DIR} resolved)"
    else
        warn "envsubst not found — sed fallback"
        cp "$REPO_DIR/CLAUDE.md" "$CLAUDE_RULES"
        sed -i "s|\${REPO_DIR}|$REPO_DIR|g" "$CLAUDE_RULES"
        log "Generated ~/.claude/CLAUDE.md (sed fallback)"
    fi
else
    warn "CLAUDE.md template not found in repo — skipping Claude Code rules"
fi

# ─── Step 5: Systemd pull timer (auto-sync every 15 min) ───────────────

info "Step 5: Installing sync pull timer"

if command -v systemctl &>/dev/null && systemctl --user status &>/dev/null 2>&1; then
    mkdir -p "$SYSTEMD_USER_DIR"

    cp "$REPO_DIR/sync/governance-pull.service" "$SYSTEMD_USER_DIR/governance-pull.service"
    cp "$REPO_DIR/sync/governance-pull.timer"   "$SYSTEMD_USER_DIR/governance-pull.timer"

    # Patch the service to use the real repo path on this machine
    sed -i "s|%h/copilot-governance|$REPO_DIR|g" \
        "$SYSTEMD_USER_DIR/governance-pull.service"

    systemctl --user daemon-reload
    systemctl --user enable --now governance-pull.timer 2>/dev/null || \
        systemctl --user enable governance-pull.timer 2>/dev/null || \
        warn "Could not enable governance-pull.timer — run: systemctl --user enable --now governance-pull.timer"

    log "Governance pull timer enabled (every 15 min)"

    # Enable linger so timer persists after logout (important on Crostini)
    if command -v loginctl &>/dev/null; then
        loginctl enable-linger "$(whoami)" 2>/dev/null || \
            warn "loginctl enable-linger failed — timer may not persist after logout"
        log "Linger enabled (timer survives logout)"
    fi
else
    warn "systemd user session not available — skipping timer install"
    warn "Run 'bash $REPO_DIR/sync/pull.sh' manually to sync from main"
fi

# ─── Step 6: BYOK reminder ─────────────────────────────────────────────

info "Step 6: Multi-model API keys"
echo ""
echo "  To add Anthropic, OpenRouter, or other model providers:"
echo "  1. Open VS Code"
echo "  2. Command Palette → 'Chat: Manage Language Models' → 'Add Models'"
echo "  3. Select your provider and enter your API key"
echo "  4. Keys are stored in VS Code's secure credential storage (not in files)"
echo ""
warn "NEVER store API keys in this repo, .env files, or settings.json"

# ─── Step 7: Settings Sync reminder ────────────────────────────────────

info "Step 7: Settings Sync"
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
echo "║  VS Code  : ~/.copilot/ → $REPO_DIR"
echo "║  Antigravity: ~/.gemini/GEMINI.md + skills/ symlink         ║"
echo "║  Claude Code: ~/.claude/CLAUDE.md + skills/ symlink         ║"
echo "║  Sync timer : every 15 min (governance-pull.timer)          ║"
echo "║                                                             ║"
echo "║  Next: gh auth login  (once per machine, for PRs)           ║"
echo "║  Pull now: bash $REPO_DIR/sync/pull.sh"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
