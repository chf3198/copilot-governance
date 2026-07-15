#!/usr/bin/env node
// role-baton-audit (#1876 AC5) — scans open + recently-closed tickets via gh CLI,
// applies role-baton-linter, aggregates findings + alias-derivation drift (R3).
'use strict';

const { execSync } = require('node:child_process');
const { lint } = require('./role-baton-linter');
const { validateArtifactAlias } = require('./megalint/signer-registry-check');

const SAMPLE_LIMIT = 200;
const SIGNER_PATTERN = /Signed-by:\s*([^\n]+)/i;

function gh(args) {
  try { return execSync(args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (err) { return err.stdout?.toString('utf8') || ''; }
}

function fetchIssues(opts = {}) {
  const state = opts.state || 'all';
  const limit = opts.limit || SAMPLE_LIMIT;
  const raw = gh(`gh issue list --state ${state} --limit ${limit} ` +
    `--json number,title,state,labels,comments`);
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

const SNIPPET_TRUNCATE = 120;

function normalize(issue) {
  return { number: issue.number, title: issue.title, state: issue.state,
    labels: (issue.labels || []).map(l => l.name),
    comments: (issue.comments || []).map(comment => ({ body: comment.body })) };
}

function aliasDriftIn(issue) {
  const violations = [];
  for (const comment of issue.comments) {
    const body = String(comment.body || '');
    if (!/MANAGER_HANDOFF|COLLABORATOR_HANDOFF|ADMIN_HANDOFF|CONSULTANT_CLOSEOUT/.test(body)) continue;
    const result = validateArtifactAlias(body);
    if (!result.ok && result.violation && result.violation.rule === 'signer-alias-not-canonical') {
      violations.push({ ticket: issue.number, rule: 'alias-drift',
        detail: result.violation.detail });
    }
  }
  return violations;
}

function audit(opts = {}) {
  const issues = (opts.issues || fetchIssues(opts)).map(normalize);
  const findings = [];
  const aliasFindings = [];
  for (const issue of issues) {
    const result = lint(issue);
    if (!result.ok) {
      findings.push({ ticket: issue.number, type: result.type, state: issue.state,
        title: issue.title, violations: result.violations });
    }
    aliasFindings.push(...aliasDriftIn(issue));
  }
  return { ok: findings.length === 0 && aliasFindings.length === 0,
    issues_scanned: issues.length,
    workflow_violations: findings.length,
    alias_drift_count: aliasFindings.length,
    findings, alias_findings: aliasFindings };
}

function fmtHuman(result) {
  const lines = [`\nrole-baton audit — Epic #1876\n`,
    `  scanned: ${result.issues_scanned} issues`,
    `  workflow violations: ${result.workflow_violations}`,
    `  alias drift: ${result.alias_drift_count}`, ''];
  for (const finding of result.findings.slice(0, 20)) {
    lines.push(`  #${finding.ticket} [${finding.type}/${finding.state}] ${finding.title.slice(0, 60)}`);
    for (const violation of finding.violations) {
      lines.push(`    - ${violation.rule}: ${violation.detail.slice(0, SNIPPET_TRUNCATE)}`);
    }
  }
  if (result.findings.length > 20) lines.push(`  ... +${result.findings.length - 20} more`);
  return lines.join('\n');
}

if (require.main === module) {
  const result = audit({ state: process.argv.includes('--closed') ? 'closed' : 'all' });
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else process.stdout.write(fmtHuman(result) + '\n');
  process.exit(result.ok ? 0 : 1);
}

module.exports = { audit, normalize, aliasDriftIn, fmtHuman, fetchIssues };
