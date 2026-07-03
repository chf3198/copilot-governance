#!/usr/bin/env node
// anneal-decision-audit (#1855 AC6) — standalone audit. Reads a transcript file
// (or stdin) and reports recognition/decision balance. Exit non-zero on imbalance.
'use strict';

const fs = require('node:fs');
const { evaluate } = require('./anneal-decision-detector');

function readInput(arg) {
  if (arg && arg !== '-' && fs.existsSync(arg)) return fs.readFileSync(arg, 'utf8');
  if (!process.stdin.isTTY) return fs.readFileSync(0, 'utf8');
  return '';
}

function fmtHuman(result) {
  const lines = [
    `recognitions:        ${result.recognitions_count}`,
    `inline decisions:    ${result.inline_decisions}`,
    `recorded decisions:  ${result.recorded_decisions}`,
    `unmatched:           ${result.unmatched_recognitions}`,
  ];
  if (!result.ok) {
    lines.push('');
    lines.push(`✗ Unmatched recognitions — recognition without recorded decision violates the anneal-decision contract.`);
    lines.push(`  Decision must be one of: file-ticket | log-incident-only | memory-note-only | no-action-justified`);
    lines.push('');
    lines.push('Recognition samples:');
    for (const sample of result.recognition_samples) {
      lines.push(`  L${sample.line}: ${sample.snippet}`);
    }
  } else {
    lines.push('');
    lines.push('✓ Recognition/decision balance OK.');
  }
  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  const inputArg = argv.find(a => !a.startsWith('--'));
  const text = readInput(inputArg);
  const json = argv.includes('--json');
  const result = evaluate(text);
  process.stdout.write(json ? JSON.stringify(result, null, 2) + '\n' : fmtHuman(result) + '\n');
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { main, fmtHuman };
