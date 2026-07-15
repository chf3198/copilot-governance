#!/usr/bin/env node
// antigravity-hooks-emit (#3448, Epic #3411 T2.5) — emit Antigravity `.antigravity/hooks.json`
// from the harness hook scripts using camelCase event names matching the Antigravity SDK.
//
// Antigravity fires camelCase lifecycle events (sessionStart/userPromptSubmit/preToolUse/
// postToolUse/stop). The harness ships a single set of Python hook scripts keyed by the
// Claude-Code PascalCase event taxonomy. This module is the pure adapter: EVENT_MAP names
// which harness script(s) each Antigravity event drives, HARNESS_EVENT maps each Antigravity
// event onto the PascalCase taxonomy slot, and emit() renders the deterministic
// `.antigravity/hooks.json` Antigravity consumes.
//
// No Date/random/env reads — identical input yields byte-identical output
// (cross-runtime invariant, #2674).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Deployed hook-script location for the Antigravity runtime (mirrors ~/.copilot and
// ~/.codex hook deploy targets; populated by `deploy.sh --target antigravity --apply`).
// Matches ANTIGRAVITY_DEPLOY in hook-parity-check.js.
const DEFAULT_HOOK_DIR = '~/.gemini/antigravity/hooks/scripts';

// Antigravity camelCase event -> ordered harness hook script(s) it invokes.
// All 9 orchestrator-governance-parity requiredHookScripts are covered:
//   sessionStart        : session_context.py + hamr_activation_check.py
//   userPromptSubmit    : manager_ticket_gate.py + goal_lens.py + userprompt_gate.py
//   preToolUse          : commit_ticket_gate.py + pretool_guard.py  (the ENFORCEMENT events)
//   postToolUse         : posttool_reminders.py
//   stop                : stop_reminder.py                          (the ENFORCEMENT events)
//
// The runtime descriptor (inventory/runtimes/antigravity.json §hooks.events) confirms
// preToolUse and stop as the two primary enforcement events for this runtime.
const EVENT_MAP = {
  sessionStart: ['session_context.py', 'hamr_activation_check.py'],
  userPromptSubmit: ['manager_ticket_gate.py', 'goal_lens.py', 'userprompt_gate.py'],
  preToolUse: ['commit_ticket_gate.py', 'pretool_guard.py'],
  postToolUse: ['posttool_reminders.py'],
  stop: ['stop_reminder.py'],
};

// Antigravity camelCase event -> harness PascalCase taxonomy slot.
// Used by parity tooling to assert every Antigravity event lands on a known harness event class.
const HARNESS_EVENT = {
  sessionStart: 'SessionStart',
  userPromptSubmit: 'UserPromptSubmit',
  preToolUse: 'PreToolUse',
  postToolUse: 'PostToolUse',
  stop: 'Stop',
};

/**
 * Build the Antigravity hooks.json object from EVENT_MAP.
 * @param {string} [hookDir] Deployed hook-script directory.
 * @returns {{ version: number, hooks: object }} Ready to JSON.stringify.
 */
function build(hookDir = DEFAULT_HOOK_DIR) {
  const hooks = {};
  for (const antigravityEvent of Object.keys(EVENT_MAP)) {
    hooks[antigravityEvent] = EVENT_MAP[antigravityEvent].map((script) => ({
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
 * Write `.antigravity/hooks.json` under the given repo root.
 * @param {string} root Repository root.
 * @param {string} [hookDir] Deployed hook-script directory.
 * @returns {string} The written file path.
 */
function emit(root, hookDir = DEFAULT_HOOK_DIR) {
  const outDir = path.join(root, '.antigravity');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'hooks.json');
  fs.writeFileSync(outFile, render(hookDir));
  return outFile;
}

if (require.main === module) {
  const rootIndex = process.argv.indexOf('--root');
  const repoRoot = rootIndex !== -1
    ? process.argv[rootIndex + 1]
    : path.resolve(__dirname, '..', '..');
  const written = emit(repoRoot);
  process.stdout.write(`wrote ${written}\n`);
}

module.exports = { EVENT_MAP, HARNESS_EVENT, DEFAULT_HOOK_DIR, build, render, emit };
