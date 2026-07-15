'use strict';

const { extractArtifactFields, validateArtifactAlias } = require('./megalint/signer-registry-check');

const ARTIFACT_ROLE = {
  MANAGER_HANDOFF: 'manager',
  COLLABORATOR_HANDOFF: 'collaborator',
  ADMIN_HANDOFF: 'admin',
  CONSULTANT_CLOSEOUT: 'consultant',
};

const EPIC_FORBIDDEN_ARTIFACTS = ['ADMIN_HANDOFF', 'COLLABORATOR_HANDOFF'];

function isEpic(labels) {
  return (labels || []).some(name => String(name).toLowerCase() === 'type:epic');
}

function roleFromBody(body) {
  return extractArtifactFields(body).role;
}

function artifactHeaderRe(artifact) {
  return new RegExp(`(^|\\n)\\s*(?:\\*\\*|##\\s+)?${artifact}\\b(?!_SUPERSEDED)`);
}

function classifyComment(body) {
  const found = [];
  for (const [artifact, role] of Object.entries(ARTIFACT_ROLE)) {
    if (artifactHeaderRe(artifact).test(body)) found.push({ artifact, role, body });
  }
  return found;
}

// Last-of-each-type across the comment trail (#3030 C1) — matches per-role gate finders.
function entries(comments) {
  const last = new Map();
  for (const comment of comments || []) {
    for (const entry of classifyComment(String((comment && comment.body) || comment || ''))) {
      last.set(entry.artifact, entry);
    }
  }
  return [...last.values()];
}

function entriesAll(comments) {
  const out = [];
  for (const comment of comments || []) {
    out.push(...classifyComment(String((comment && comment.body) || comment || '')));
  }
  return out;
}

function fixable(rule) {
  return ['artifact-role-mismatch', 'signer-alias-not-registry-derived', 'signer-fields-invalid', 'mixed-semantic-role-fields'].includes(rule);
}

function violation(artifact, rule, detail, severity = 'hard') {
  const record = { artifact, rule, detail, severity };
  if (fixable(rule)) {
    record.remediation = {
      mode: 'source-edit-first',
      suggestedFix: 'Edit the offending issue comment/artifact in place, then rerun consultant checks.',
    };
  }
  return record;
}

function validateEntry(entry, opts, linkedIsEpic) {
  const out = [];
  if (linkedIsEpic && EPIC_FORBIDDEN_ARTIFACTS.includes(entry.artifact)) {
    out.push(violation(entry.artifact, 'epic-shape-forbidden-artifact',
      `${entry.artifact} forbidden on type:epic per Rule E2 v2.`));
    return out;
  }
  const actualRole = roleFromBody(entry.body);
  if (!actualRole || actualRole !== entry.role) {
    out.push(violation(entry.artifact, 'artifact-role-mismatch', `Expected Role: ${entry.role} for ${entry.artifact}.`));
  }
  const alias = validateArtifactAlias(entry.body, opts);
  if (!alias.ok && alias.violation) out.push(violation(entry.artifact, alias.violation.rule, alias.violation.detail));
  else if (!alias.ok) out.push(violation(entry.artifact, 'signer-fields-invalid', alias.skipped || 'invalid signer fields'));
  return out;
}

function analyzeComments(comments, opts = {}) {
  const linkedIsEpic = isEpic(opts.linkedIssueLabels);
  const active = entries(comments);
  const activeBodies = new Set(active.map(e => e.body));
  const violations = [];
  const advisories = [];
  for (const entry of active) violations.push(...validateEntry(entry, opts, linkedIsEpic));
  for (const entry of entriesAll(comments)) {
    if (activeBodies.has(entry.body)) continue;
    const stale = validateEntry(entry, opts, linkedIsEpic);
    for (const item of stale) advisories.push({ ...item, severity: 'advisory', rule: `superseded-${item.rule}` });
  }
  return { ok: violations.length === 0, count: active.length, violations, advisories };
}

module.exports = {
  entries, entriesAll, analyzeComments, ARTIFACT_ROLE, isEpic, EPIC_FORBIDDEN_ARTIFACTS, violation, classifyComment,
};
