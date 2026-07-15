#!/usr/bin/env node
// complexity-report — emit per-file cyclomatic complexity violations from ESLint.
// Per #1971 AC3. Writes JSON to ~/.megingjord/lint-reports/complexity-<YYYY-MM-DD>.json.
// G4 box: no credential surface (reads ESLint output only).
// G10 box: this file ≤100 lines, ≤10 complexity per function.

'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPORT_DIR = path.join(os.homedir(), '.megingjord', 'lint-reports');
const CONFIG = path.join(__dirname, '..', '..', 'lint-configs', 'eslint.config.devenv.js');

/** Run ESLint against the targets and parse JSON output.
 * @param {string[]} targets - paths to lint.
 * @returns {Array} ESLint JSON report or [] on failure. */
function runEslintJson(targets) {
  try {
    const out = execFileSync('npx',
      ['eslint', '-c', CONFIG, '--max-warnings', '999999', '--format', 'json', ...targets],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd: path.join(__dirname, '..', '..') }
    );
    return JSON.parse(out);
  } catch (e) {
    if (e.stdout) {
      try { return JSON.parse(e.stdout); } catch { return []; }
    }
    return [];
  }
}

/** Filter ESLint report to complexity rule violations only.
 * @param {Array} eslintReport - ESLint JSON output.
 * @returns {Array} violations with file/line/column/message/severity. */
function extractComplexityViolations(eslintReport) {
  const violations = [];
  for (const file of eslintReport) {
    for (const m of file.messages || []) {
      if (m.ruleId === 'complexity') {
        violations.push({
          file: path.relative(process.cwd(), file.filePath),
          line: m.line, column: m.column, message: m.message, severity: m.severity,
        });
      }
    }
  }
  return violations;
}

/** Write complexity violations as dated JSON report.
 * @param {Array} violations - extracted complexity violations.
 * @returns {string} absolute path to the written report. */
function writeReport(violations) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(REPORT_DIR, `complexity-${date}.json`);
  const report = {
    generated_at: new Date().toISOString(),
    ticket: 1971,
    rule: { id: 'complexity', threshold: 10, mode: 'warn' },
    total_violations: violations.length,
    files_with_violations: new Set(violations.map((v) => v.file)).size,
    violations,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

/** CLI entry point: run lint, extract, write, log.
 * @param {string[]} argv - target paths or default to known dirs.
 * @returns {number} count of complexity violations found. */
function main(argv) {
  const targets = argv.length ? argv : ['dashboard/js', 'scripts/global', 'scripts/wiki'];
  const eslintReport = runEslintJson(targets);
  const violations = extractComplexityViolations(eslintReport);
  const reportPath = writeReport(violations);
  console.log(`complexity-report: ${violations.length} violations → ${reportPath}`);
  return violations.length;
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { runEslintJson, extractComplexityViolations, writeReport };
