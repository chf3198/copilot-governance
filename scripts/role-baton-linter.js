#!/usr/bin/env node
// role-baton-linter (#1876) — validates Epic + child ticket role-baton shape
// against Rule E2 v2 + baton-routing-v2.0 + Epic #1828 single-status invariant.
// Composes with closed Epics #1854 / #1855 / #1827 / #1871 / #1875.
'use strict';

const { isEpic, EPIC_FORBIDDEN_ARTIFACTS } = require('./baton-artifact-governance');

const TERMINAL_STATUSES = new Set(['status:done', 'status:cancelled']);
const REQUIRED_CHILD_ARTIFACTS = ['MANAGER_HANDOFF', 'COLLABORATOR_HANDOFF',
  'ADMIN_HANDOFF', 'CONSULTANT_CLOSEOUT'];
const BRIEF_EVIDENCE_PATTERN = /resolved as part of (?:Epic )?#\d+/i;
const STATUS_PREFIX = 'status:';
const ROLE_PREFIX = 'role:';
const VALID_ROLES_ON_EPIC = new Set(['role:manager', 'role:consultant']);

function statusLabels(labels) {
  return (labels || []).map(String).filter(l => l.startsWith(STATUS_PREFIX));
}

function roleLabels(labels) {
  return (labels || []).map(String).filter(l => l.startsWith(ROLE_PREFIX));
}

function artifactsPresent(comments) {
  const present = new Set();
  for (const comment of (comments || [])) {
    const body = String((comment && comment.body) || comment || '');
    for (const art of REQUIRED_CHILD_ARTIFACTS) {
      if (body.includes(art)) present.add(art);
    }
  }
  return present;
}

function lintEpic(issue) {
  const violations = [];
  for (const role of roleLabels(issue.labels || [])) {
    if (!VALID_ROLES_ON_EPIC.has(role)) {
      violations.push({ rule: 'epic-invalid-role-label', detail:
        `Epic carries ${role}; Rule E2 v2 allows only role:manager (lifecycle) or role:consultant (status:review only).` });
    }
  }
  const artifacts = artifactsPresent(issue.comments);
  for (const forbidden of EPIC_FORBIDDEN_ARTIFACTS) {
    if (artifacts.has(forbidden)) {
      violations.push({ rule: 'epic-forbidden-artifact', detail:
        `Epic has ${forbidden} comment; ${forbidden === 'ADMIN_HANDOFF' ? 'Admin' : 'Collaborator'} phase belongs on CHILD tickets, not the Epic itself (Rule E2 v2).` });
    }
  }
  return violations;
}

function lintChild(issue, opts = {}) {
  const violations = [];
  const statuses = statusLabels(issue.labels || []);
  if (statuses.length > 1) {
    violations.push({ rule: 'multi-status', detail:
      `Multiple status:* labels (${statuses.join(', ')}) — Rule 1 / Epic #1828 AC6.` });
  }
  if (issue.state === 'CLOSED') {
    const artifacts = artifactsPresent(issue.comments);
    const missing = REQUIRED_CHILD_ARTIFACTS.filter(a => !artifacts.has(a));
    const briefEvidenceOnly = (issue.comments || []).some(c =>
      BRIEF_EVIDENCE_PATTERN.test(String((c && c.body) || c || '')));
    const isMultiCloseBatchSibling = briefEvidenceOnly && !opts.skipBatchExemption;
    if (missing.length > 0 && !isMultiCloseBatchSibling) {
      violations.push({ rule: 'child-missing-baton-artifacts', detail:
        `Closed child ticket missing baton artifacts: ${missing.join(', ')}. ` +
        `Multi-Close batch siblings MAY use brief-evidence per #1714 (not detected here).` });
    }
  }
  return violations;
}

function lint(issue, opts = {}) {
  if (!issue) return { ok: true, violations: [], reason: 'no-issue' };
  const labels = issue.labels || [];
  const type = labels.find(l => String(l).startsWith('type:'));
  if (TERMINAL_STATUSES.has(issue.terminal_status_at_lint) && opts.skipTerminal) {
    return { ok: true, violations: [], reason: 'terminal-exclusion' };
  }
  const violations = isEpic(labels) ? lintEpic(issue) : lintChild(issue, opts);
  return { ok: violations.length === 0, type, violations,
    ticket: issue.number, title: issue.title };
}

if (require.main === module) {
  const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
  const result = lint(input);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

module.exports = { lint, lintEpic, lintChild, statusLabels, roleLabels,
  artifactsPresent, REQUIRED_CHILD_ARTIFACTS, BRIEF_EVIDENCE_PATTERN,
  VALID_ROLES_ON_EPIC, TERMINAL_STATUSES };
