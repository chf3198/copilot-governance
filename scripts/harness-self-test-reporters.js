#!/usr/bin/env node
// harness-self-test-reporters (#1826 AC2/AC3) — tiered output: human/json/markdown.
// Every report includes per-check (name, expected, observed, diagnosis, recommend_action).
'use strict';

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const GREEN = COLOR ? '\x1b[32m' : '';
const RED = COLOR ? '\x1b[31m' : '';
const YELLOW = COLOR ? '\x1b[33m' : '';
const DIM = COLOR ? '\x1b[2m' : '';
const RESET = COLOR ? '\x1b[0m' : '';
const OBSERVED_TRUNCATE_HUMAN = 200;
const OBSERVED_TRUNCATE_JSON = 500;

function fmtHuman(checkResults, summary) {
  const lines = [`\n  ${summary.passed_count}/${summary.total} pass · ${summary.elapsed_ms}ms\n`];
  const cap = checkResults.filter(c => c.check.category === 'capability');
  const reg = checkResults.filter(c => c.check.category === 'regression');
  for (const [label, group] of [['capability', cap], ['regression', reg]]) {
    if (group.length === 0) continue;
    lines.push(`${DIM}── ${label} (${group.filter(r => r.result.passed).length}/${group.length}) ──${RESET}`);
    for (const { check, result } of group) {
      const status = result.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      lines.push(`  ${status} ${check.id} ${DIM}${check.name}${RESET}`);
      if (!result.passed) {
        lines.push(`    ${DIM}expected:${RESET} ${check.expected}`);
        lines.push(`    ${DIM}observed:${RESET} ${String(result.observed || '').slice(0, OBSERVED_TRUNCATE_HUMAN)}`);
        lines.push(`    ${YELLOW}→ ${check.fail_recommend || 'no recommendation'}${RESET}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function fmtJson(checkResults, summary) {
  return JSON.stringify({
    summary,
    checks: checkResults.map(({ check, result }) => ({
      id: check.id, name: check.name, category: check.category,
      expected: check.expected, observed: String(result.observed || '').slice(0, OBSERVED_TRUNCATE_JSON),
      diagnosis: result.diagnosis || (result.passed ? 'pass' : 'fail'),
      recommend_action: result.passed ? null : (check.fail_recommend || null),
      passed: result.passed, exit_code: result.exitCode ?? null,
      elapsed_ms: result.elapsedMs ?? null,
    })),
  }, null, 2);
}

function fmtMarkdown(checkResults, summary) {
  const lines = [
    `# Harness self-test results`,
    ``,
    `**Summary**: ${summary.passed_count}/${summary.total} pass · ${summary.elapsed_ms}ms · exit ${summary.exit_code}`,
    ``,
    `| ✓/✗ | id | category | diagnosis | recommend |`,
    `|---|---|---|---|---|`,
  ];
  for (const { check, result } of checkResults) {
    const mark = result.passed ? '✓' : '✗';
    const rec = result.passed ? '—' : (check.fail_recommend || '—').replace(/\|/g, '\\|');
    const diag = (result.diagnosis || (result.passed ? 'pass' : 'fail')).replace(/\|/g, '\\|');
    lines.push(`| ${mark} | \`${check.id}\` | ${check.category} | ${diag} | ${rec} |`);
  }
  return lines.join('\n');
}

function render(checkResults, summary, format = 'human') {
  if (format === 'json') return fmtJson(checkResults, summary);
  if (format === 'markdown') return fmtMarkdown(checkResults, summary);
  return fmtHuman(checkResults, summary);
}

module.exports = { render, fmtHuman, fmtJson, fmtMarkdown };
