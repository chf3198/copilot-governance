#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const HIGH = new Set(['delete-file', 'deploy-apply', 'git-push', 'shell-destructive']);
// Exact runtime set: copilot, codex, claude-code, cursor, antigravity.
// 'vscode-extension' was a phantom entry — this project has no vscode-extension
// runtime. Removed in #3455 (phantom allowlist fix). If a vscode-extension
// runtime is added in future, add it here with its real commandIds.
// Note: copilot operates via github-actions runner; no local commandId surface.
const ALLOWLIST = {
  copilot: [],
  codex: ['codex.openHelp', 'codex.showPolicy'],
  'claude-code': ['claude.showPolicy', 'claude.help'],
  cursor: ['cursor.showPolicy', 'cursor.help'],
  antigravity: ['antigravity.showPolicy', 'antigravity.help'],
};
const SPOOF = [/\b(ignore\s+policy|system\s+override|admin\s+bypass)\b/i,
  /\bmanager\s+approved\s+offline\b/i, /\bjust\s+run\s+it\s+now\b/i];

/**
 * Apply runtime side-effect policy for orchestrator actions.
 * @param {{runtime:string,actionId:string,commandId?:string,approval?:boolean,contextText?:string}} req action request envelope.
 * @returns {{decision:'allow'|'deny',runtime:string,actionId:string,reasons:string[],audit:{highRisk:boolean,approved:boolean,commandId:string|null}}}
 */
function evaluate(req) {
  const reasons = [];
  const runtime = req.runtime;
  if (!ALLOWLIST[runtime]) reasons.push('unknown-runtime');
  if (req.commandId && !ALLOWLIST[runtime]?.includes(req.commandId)) reasons.push('untrusted-command-id');
  if (HIGH.has(req.actionId) && req.approval !== true) reasons.push('approval-required');
  if (SPOOF.some(re => re.test(req.contextText || ''))) reasons.push('authority-spoof-detected');
  const decision = reasons.length ? 'deny' : 'allow';
  return {
    decision,
    runtime,
    actionId: req.actionId,
    reasons,
    audit: { highRisk: HIGH.has(req.actionId), approved: req.approval === true, commandId: req.commandId || null },
  };
}

/** @returns {void} */
function run() {
  const raw = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
  const req = JSON.parse(raw || '{}');
  const result = evaluate(req);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.decision === 'allow' ? 0 : 1);
}

module.exports = { evaluate, HIGH, ALLOWLIST, SPOOF };
if (require.main === module) run();
