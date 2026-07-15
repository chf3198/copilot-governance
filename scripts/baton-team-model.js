'use strict';
// baton-team-model — Epic #1568 AC-3 (#1572). Enforces model diversity
// on the critical review path: Admin's Team&Model must differ from
// Collaborator's, and Consultant's must differ from Admin's. Manager
// and Collaborator may share a model (shared intent is acceptable;
// review independence is what matters). Cross-model within provider
// passes (claude-code:opus-4-7 vs claude-code:sonnet-4-6 OK); same
// Team&Model literal across either critical-path pair fails.
//
// Defeats the same-model-as-actor-and-critic self-bias amplification
// quantified in Panickssery et al. (NeurIPS '24/'25) and follow-on
// 2025-2026 work cited in research ticket #1569.

const TEAM_MODEL_RE = /^Team&Model:\s*(.+)$/m;
const OVERRIDE_LABEL = 'model-diversity:waived';

function parseTeamModel(artifactBody) {
  if (typeof artifactBody !== 'string' || !artifactBody) return null;
  const match = artifactBody.match(TEAM_MODEL_RE);
  return match ? match[1].trim() : null;
}

function shouldSkip(labels) {
  if ((labels || []).includes(OVERRIDE_LABEL)) return 'override-waived';
  return null;
}

function enforceCriticalPathDiversity(input) {
  const labels = input.labels || [];
  const skipReason = shouldSkip(labels);
  if (skipReason) {
    return { ok: true, violations: [], skipped: skipReason };
  }
  const collab = input.collaborator || null;
  const admin = input.admin || null;
  const consultant = input.consultant || null;
  const violations = [];
  if (collab && admin && collab === admin) {
    violations.push({
      rule: 'collab-admin-same-team-model',
      pair: 'COLLABORATOR_HANDOFF == ADMIN_HANDOFF',
      team_model: collab,
      detail: `Admin must differ from Collaborator. Both used "${collab}".`,
    });
  }
  if (admin && consultant && admin === consultant) {
    violations.push({
      rule: 'admin-consultant-same-team-model',
      pair: 'ADMIN_HANDOFF == CONSULTANT_CLOSEOUT',
      team_model: admin,
      detail: `Consultant must differ from Admin. Both used "${admin}".`,
    });
  }
  return { ok: violations.length === 0, violations };
}

function extractFromComments(comments) {
  const out = { collaborator: null, admin: null, consultant: null };
  for (const comment of comments || []) {
    const body = (comment && comment.body) || '';
    const tm = parseTeamModel(body);
    if (!tm) continue;
    if (body.includes('COLLABORATOR_HANDOFF')) out.collaborator = tm;
    else if (body.includes('ADMIN_HANDOFF')) out.admin = tm;
    else if (body.includes('CONSULTANT_CLOSEOUT')) out.consultant = tm;
  }
  return out;
}

module.exports = {
  parseTeamModel, enforceCriticalPathDiversity, extractFromComments,
  shouldSkip, OVERRIDE_LABEL,
};
