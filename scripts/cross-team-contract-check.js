#!/usr/bin/env node
// Cross-team governance contract check (#1606).
// Verifies the 4 invariants from governance/README.md are present in all 4 entry-point files.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const ENTRY_POINTS = [
  { path: 'AGENTS.md', label: 'AGENTS.md (generic)' },
  { path: 'CLAUDE.md', label: 'CLAUDE.md (Claude Code)' },
  { path: '.github/copilot-instructions.md', label: 'Copilot entry' },
  { path: '.codex/AGENTS.md', label: 'Codex project doc' },
  { path: '.antigravity/instructions.md', label: 'Antigravity entry' },
  { path: '.cursor/rules/megingjord.mdc', label: 'Cursor entry' },
];

const INVARIANTS = [
  { id: 'team-model-signing', patterns: [/team[\s&]?[\s_]?model/i, /signed-by|signing|signature/i] },
  { id: 'baton-order', patterns: [/baton|manager.*collab|collab.*admin|admin.*consultant/i] },
  { id: 'ticket-first', patterns: [/ticket|issue|#\d+|refs\s+#/i] },
  { id: 'dedicated-worktree', patterns: [/worktree|concurrent\s+(session|agent)/i] },
];

const CONTRACT_POINTER = /governance\/(README|contract)/i;

function readFile(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function checkEntryPoint(entry) {
  const content = readFile(entry.path);
  if (content === null) return { entry, error: `missing file: ${entry.path}` };
  const findings = [];
  for (const inv of INVARIANTS) {
    const hit = inv.patterns.some(re => re.test(content));
    if (!hit) findings.push({ invariant: inv.id, missing: true });
  }
  const pointerHit = CONTRACT_POINTER.test(content);
  return { entry, findings, pointerHit };
}

function checkContractDoc() {
  const content = readFile('governance/README.md');
  if (content === null) return { error: 'missing governance/README.md' };
  const missing = INVARIANTS.filter(inv => !inv.patterns.some(re => re.test(content))).map(i => i.id);
  return { missing };
}

function run({ requirePointer = true } = {}) {
  const contractCheck = checkContractDoc();
  const entryResults = ENTRY_POINTS.map(checkEntryPoint);
  const errors = [];
  if (contractCheck.error) errors.push(contractCheck.error);
  if (contractCheck.missing && contractCheck.missing.length)
    errors.push(`governance/README.md missing invariants: ${contractCheck.missing.join(',')}`);
  for (const result of entryResults) {
    if (result.error) { errors.push(result.error); continue; }
    if (result.findings.length) {
      for (const finding of result.findings) errors.push(`${result.entry.label}: missing invariant ${finding.invariant}`);
    }
    if (requirePointer && !result.pointerHit) errors.push(`${result.entry.label}: missing pointer to governance/README.md`);
  }
  return { ok: errors.length === 0, errors, entryResults, contractCheck };
}

if (require.main === module) {
  const result = run();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    for (const e of result.errors) process.stderr.write(`✗ ${e}\n`);
    if (result.ok) process.stdout.write('✓ cross-team contract check passed\n');
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = { run, ENTRY_POINTS, INVARIANTS };
