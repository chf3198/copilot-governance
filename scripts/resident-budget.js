#!/usr/bin/env node
'use strict';
// resident-budget.js (#3127): measure the always-resident context set (instructions/*.md + CLAUDE.md
// + optional operator MEMORY.md) in bytes + estimated tokens, against a baseline and target. Also
// lints MEMORY.md index lines against the pointer-length budget. Advisory by default; --strict exits
// non-zero over target or on pointer violations. Deterministic, local, $0 — no LLM, no network.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const TOKENS_PER_BYTE = 0.25; // ~4 bytes/token heuristic
const BASELINE_TOKENS = 59000; // measured 2026-06-19 (Epic #3124 / Phase-0 #3125)
const TARGET_TOKENS = 30000;
const POINTER_MAX_CHARS = 200; // MEMORY.md index-line pointer budget
const HOOK_PREVIEW_CHARS = 70; // how much of an over-budget line to echo in a violation

/** Resolve the operator MEMORY.md path from --memory-path flag or env, else null.
 * @param {string[]} argv CLI args. @returns {string|null} resolved path or null. */
function memoryPath(argv) {
  const flagIndex = argv.indexOf('--memory-path');
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return process.env.MEGINGJORD_MEMORY_PATH || null;
}

/** Always-resident repo files: CLAUDE.md plus ONLY the instructions it @-imports. The earlier
 * all-files count over-counted; only @-imported instructions are actually resident (Epic T1). */
function residentRepoFiles() {
  const claudeMd = path.join(root, 'CLAUDE.md');
  const files = [claudeMd];
  if (fs.existsSync(claudeMd)) {
    const text = fs.readFileSync(claudeMd, 'utf8');
    for (const match of text.matchAll(/@instructions\/(\S+\.md)/g)) {
      files.push(path.join(root, 'instructions', match[1]));
    }
  }
  return files.filter((file) => fs.existsSync(file));
}

/** Byte size of a file, or 0 if unreadable.
 * @param {string} file path. @returns {number} bytes. */
function byteSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/** MEMORY.md index bullet lines exceeding the pointer budget. Absent file -> [] (resilient, G6).
 * @param {string|null} memoryFile path. @returns {string[]} over-budget line summaries. */
function pointerViolations(memoryFile) {
  if (!memoryFile || !fs.existsSync(memoryFile)) return [];
  const violations = [];
  for (const line of fs.readFileSync(memoryFile, 'utf8').split('\n')) {
    if (line.startsWith('- [') && line.length > POINTER_MAX_CHARS) {
      violations.push(`${line.length}c: ${line.slice(0, HOOK_PREVIEW_CHARS)}...`);
    }
  }
  return violations;
}

/** Compute the resident-budget report object.
 * @param {string[]} argv CLI args. @returns {object} report. */
function computeBudget(argv) {
  const memoryFile = memoryPath(argv);
  const repoFiles = residentRepoFiles();
  let totalBytes = repoFiles.reduce((sum, file) => sum + byteSize(file), 0);
  const memoryMeasured = Boolean(memoryFile && fs.existsSync(memoryFile));
  if (memoryMeasured) totalBytes += byteSize(memoryFile);
  return {
    files: repoFiles.length + (memoryMeasured ? 1 : 0),
    bytes: totalBytes,
    tokens: Math.round(totalBytes * TOKENS_PER_BYTE),
    baseline_tokens: BASELINE_TOKENS,
    target_tokens: TARGET_TOKENS,
    over_target: Math.round(totalBytes * TOKENS_PER_BYTE) > TARGET_TOKENS,
    pointer_violations: pointerViolations(memoryFile),
    memory_measured: memoryMeasured,
  };
}

/** Render the human-readable report to stdout.
 * @param {object} report budget report. @returns {void} */
function printReport(report) {
  const reductionPct = Math.round((1 - report.tokens / report.baseline_tokens) * 100);
  process.stdout.write(
    `resident-budget: ${report.tokens} tokens (${report.bytes} bytes, ${report.files} files)\n`
  );
  process.stdout.write(
    `  baseline ${report.baseline_tokens} -> target ${report.target_tokens} | now ${reductionPct}% off baseline\n`
  );
  if (!report.memory_measured) {
    process.stdout.write(
      '  note: operator MEMORY.md not measured (set --memory-path or MEGINGJORD_MEMORY_PATH); repo-only figure\n'
    );
  }
  if (report.pointer_violations.length) {
    process.stdout.write(
      `  pointer-violations (${report.pointer_violations.length}, over ${POINTER_MAX_CHARS}c):\n`
    );
    for (const violation of report.pointer_violations) process.stdout.write(`    ${violation}\n`);
  }
  process.stdout.write(
    report.over_target
      ? `  OVER target by ${report.tokens - report.target_tokens} tokens\n`
      : '  within target\n'
  );
}

function main() {
  const argv = process.argv.slice(2);
  const report = computeBudget(argv);
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printReport(report);
  if (argv.includes('--strict') && (report.over_target || report.pointer_violations.length))
    process.exit(1);
}

if (require.main === module) main();
module.exports = { computeBudget, pointerViolations, residentRepoFiles };
