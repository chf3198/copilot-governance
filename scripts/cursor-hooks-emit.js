#!/usr/bin/env node
// cursor-hooks-emit (#3085, Epic #3083 Phase 1) — emit Cursor `.cursor/hooks.json`
// from the harness hook scripts, via a camelCase<->PascalCase event adapter.
//
// Cursor fires camelCase lifecycle events (sessionStart/beforeSubmitPrompt/preToolUse/
// stop) plus Cursor-native events (subagentStart/subagentStop/beforeShellExecution/
// beforeMCPExecution/afterFileEdit). The harness ships a single set of Python hook
// scripts keyed by the Claude-Code PascalCase event taxonomy (SessionStart/
// UserPromptSubmit/PreToolUse/PostToolUse/Stop). This module is the pure adapter:
// EVENT_MAP names which harness script(s) each Cursor event drives, HARNESS_EVENT
// names the PascalCase taxonomy slot each Cursor event maps onto, and emit() renders
// the deterministic `.cursor/hooks.json` Cursor consumes. No Date/random/env reads —
// identical input yields byte-identical output (cross-runtime invariant, #2674).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Deployed hook-script location for the Cursor runtime (mirrors the ~/.copilot and
// ~/.codex hook deploy targets; populated by `deploy.sh --target cursor`).
const DEFAULT_HOOK_DIR = '~/.cursor/hooks/scripts';

// Cursor camelCase event -> ordered harness hook script(s) it invokes.
// sessionStart drives both session context AND the HAMR activation advisory (AC2).
// The full mapping covers all nine orchestrator-governance-parity requiredHookScripts:
// the ticket-lifecycle gates (manager_ticket_gate / goal_lens / commit_ticket_gate) are
// wired in Phase 2 (#3086) so Cursor reaches gate parity with Claude Code's settings.json.
const EVENT_MAP = {
  sessionStart: ['session_context.py', 'hamr_activation_check.py'],
  beforeSubmitPrompt: ['manager_ticket_gate.py', 'goal_lens.py', 'userprompt_gate.py'],
  preToolUse: ['commit_ticket_gate.py', 'pretool_guard.py'],
  beforeShellExecution: ['commit_ticket_gate.py', 'pretool_guard.py'],
  beforeMCPExecution: ['pretool_guard.py'],
  afterFileEdit: ['posttool_reminders.py'],
  stop: ['stop_reminder.py'],
  // Cursor-native subagent lifecycle — no dedicated harness event, so they reuse the
  // closest session/stop scripts rather than carrying a waiver (full parity).
  subagentStart: ['session_context.py'],
  subagentStop: ['stop_reminder.py'],
};

// Cursor camelCase event -> harness PascalCase taxonomy slot (the adapter's other
// direction). Used by parity tooling and docs to assert every Cursor event lands on
// a known harness event class.
const HARNESS_EVENT = {
  sessionStart: 'SessionStart',
  beforeSubmitPrompt: 'UserPromptSubmit',
  preToolUse: 'PreToolUse',
  beforeShellExecution: 'PreToolUse',
  beforeMCPExecution: 'PreToolUse',
  afterFileEdit: 'PostToolUse',
  stop: 'Stop',
  subagentStart: 'SessionStart',
  subagentStop: 'Stop',
};

/**
 * Build the Cursor hooks.json object from EVENT_MAP.
 * @param {string} [hookDir] Deployed hook-script directory (default `~/.cursor/hooks/scripts`).
 * @returns {object} `{ version, hooks }` ready to JSON.stringify into `.cursor/hooks.json`.
 */
function build(hookDir = DEFAULT_HOOK_DIR) {
  const hooks = {};
  for (const cursorEvent of Object.keys(EVENT_MAP)) {
    hooks[cursorEvent] = EVENT_MAP[cursorEvent].map((script) => ({
      command: `python3 ${hookDir}/${script}`,
    }));
  }
  return { version: 1, hooks };
}

/**
 * Render the canonical, stable-key-ordered JSON string (trailing newline).
 * @param {string} [hookDir] Deployed hook-script directory.
 * @returns {string} Deterministic JSON text for the golden fixture and the committed file.
 */
function render(hookDir = DEFAULT_HOOK_DIR) {
  return `${JSON.stringify(build(hookDir), null, 2)}\n`;
}

/**
 * Write `.cursor/hooks.json` under the given repo root.
 * @param {string} root Repository root.
 * @param {string} [hookDir] Deployed hook-script directory.
 * @returns {string} The written file path.
 */
function emit(root, hookDir = DEFAULT_HOOK_DIR) {
  const outDir = path.join(root, '.cursor');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'hooks.json');
  fs.writeFileSync(outFile, render(hookDir));
  return outFile;
}

if (require.main === module) {
  const root = process.argv.includes('--root')
    ? process.argv[process.argv.indexOf('--root') + 1]
    : path.resolve(__dirname, '..', '..');
  const written = emit(root);
  process.stdout.write(`wrote ${written}\n`);
}

module.exports = { EVENT_MAP, HARNESS_EVENT, DEFAULT_HOOK_DIR, build, render, emit };
