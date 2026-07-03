#!/usr/bin/env node
'use strict';
// pre-commit-docs-check (#1898) — fail-fast pre-commit hook that detects
// staged changes to package.json and asserts README.md is in sync via
// `docs:compile --check`. Catches the recurring trap (5+ recurrences in
// 2026-05 sessions) where npm-script additions ship without docs:compile.

const { execSync, execFileSync } = require('node:child_process');

const PACKAGE_JSON_STAGED_PATTERN = /^(?:M|A|R\d\d)\s+package\.json$/m;
const REMEDIATION = 'Run `npm run docs:compile` and stage README.md, then re-commit.';

function gitStagedFiles() {
  try { return execFileSync('git', ['diff', '--cached', '--name-status'], { encoding: 'utf8' }); }
  catch { return ''; }
}

function packageJsonStaged(staged) {
  return PACKAGE_JSON_STAGED_PATTERN.test(String(staged || ''));
}

function runDocsCheck() {
  try {
    execSync('node scripts/docs-compile.js --check', { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (err) {
    const stderr = err.stderr?.toString('utf8') || '';
    const stdout = err.stdout?.toString('utf8') || '';
    return { ok: false, output: (stdout + stderr).trim() };
  }
}

function check(opts = {}) {
  if (process.env.PRE_COMMIT_DOCS_BYPASS === '1') {
    return { ok: true, skipped: 'env-bypass' };
  }
  const staged = opts.staged !== undefined ? opts.staged : gitStagedFiles();
  if (!packageJsonStaged(staged)) {
    return { ok: true, skipped: 'no-package-json-change' };
  }
  const runner = opts.docsCheck || runDocsCheck;
  const docsResult = runner();
  if (docsResult.ok) return { ok: true, package_json_staged: true, docs_in_sync: true };
  return { ok: false, package_json_staged: true, docs_in_sync: false,
    violation: { rule: 'readme-out-of-sync', detail: docsResult.output || 'docs:compile --check failed',
      remediation: REMEDIATION } };
}

if (require.main === module) {
  const result = check();
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else if (result.skipped) process.stdout.write(`pre-commit-docs-check: SKIP (${result.skipped})\n`);
  else if (result.ok) process.stdout.write(`pre-commit-docs-check: PASS\n`);
  else {
    process.stderr.write(`pre-commit-docs-check: FAIL\n`);
    process.stderr.write(`  - ${result.violation.rule}: ${result.violation.detail}\n`);
    process.stderr.write(`  - remediation: ${result.violation.remediation}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

const WORK_LOG_RE = /^(?:M|A)\s+wiki\/work-log\/tickets\/(\d+)\.md$/m;
const HANDOFF_BLOCK_RE = /(?:MANAGER_HANDOFF|COLLABORATOR_HANDOFF|ADMIN_HANDOFF|CONSULTANT_CLOSEOUT)/;

function workLogHandoffCheck(staged) {
  const match = WORK_LOG_RE.exec(String(staged || ''));
  if (!match) return { ok: true, skipped: 'no-work-log-staged' };
  return {
    ok: true, advisory: true,
    message: `work-log tickets/${match[1]}.md staged — ensure handoffs are posted on GitHub.`,
  };
}

module.exports = { check, packageJsonStaged, runDocsCheck, gitStagedFiles,
  workLogHandoffCheck, REMEDIATION, PACKAGE_JSON_STAGED_PATTERN };
