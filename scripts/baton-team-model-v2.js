'use strict';
// baton-team-model-v2 — Epic #1716 rotation contract v2 (#1719 schema).
// Extends #1572 critical-path-only with: Rule 1 (Collaborator self-review),
// Rule 2 (Admin not in any earlier step), Rule 3 (Consultant not in ANY prior step).
// Family = `team` portion of `team:model@substrate` Team&Model string.

const OVERRIDE_LABEL_V1 = 'model-diversity:waived';
const OVERRIDE_LABEL_V2 = 'rotation-required-waived';
const TEAM_MODEL_RE = /^Team&Model:\s*([^\n]+)$/m;

function extractTeam(teamModel) {
  if (typeof teamModel !== 'string') return null;
  const colonIdx = teamModel.indexOf(':');
  return colonIdx > 0 ? teamModel.slice(0, colonIdx).trim() : null;
}

function parseTeamModel(body) {
  if (typeof body !== 'string' || !body) return null;
  const match = body.match(TEAM_MODEL_RE);
  return match ? match[1].trim() : null;
}

function shouldSkip(labels, mode) {
  if (mode === 'single-model-fleet') return 'single-model-fleet';
  const set = new Set(labels || []);
  if (set.has(OVERRIDE_LABEL_V1)) return 'v1-waived';
  if (set.has(OVERRIDE_LABEL_V2)) return 'v2-waived';
  return null;
}

function checkRule1(records) {
  if (!records.collaborator_self_check || !records.implementation) return null;
  const implTeam = extractTeam(records.implementation);
  const checkTeam = extractTeam(records.collaborator_self_check);
  return implTeam === checkTeam
    ? { rule: 'rule_1_collab_self_review', detail: `self-review team '${checkTeam}' matches implementation team '${implTeam}'` }
    : null;
}

function checkRule2(records) {
  if (!records.admin) return null;
  const adminTeam = extractTeam(records.admin);
  const priorTeams = [records.manager, records.collaborator].map(extractTeam).filter(Boolean);
  return priorTeams.includes(adminTeam)
    ? { rule: 'rule_2_admin_diversity', detail: `admin team '${adminTeam}' appears in earlier role (manager or collaborator)` }
    : null;
}

function checkRule3(records) {
  if (!records.consultant) return null;
  const consultantTeam = extractTeam(records.consultant);
  const priorTeams = [records.manager, records.collaborator, records.admin].map(extractTeam).filter(Boolean);
  return priorTeams.includes(consultantTeam)
    ? { rule: 'rule_3_consultant_independent', detail: `consultant team '${consultantTeam}' appears in earlier role` }
    : null;
}

function enforceRotationV2(input) {
  const mode = input.operator_mode || 'strict-rotation';
  const skipReason = shouldSkip(input.labels, mode);
  if (skipReason) return { ok: true, violations: [], skipped: skipReason, mode };
  const records = input.roles_observed || {};
  const violations = [checkRule1(records), checkRule2(records), checkRule3(records)].filter(Boolean);
  return { ok: violations.length === 0, violations, mode };
}

function extractRecordsFromComments(comments) {
  const out = { manager: null, collaborator: null, collaborator_self_check: null, admin: null, consultant: null, implementation: null };
  for (const c of comments || []) {
    const body = (c && c.body) || '';
    const tm = parseTeamModel(body);
    if (!tm) continue;
    if (body.includes('MANAGER_HANDOFF')) out.manager = tm;
    else if (body.includes('COLLABORATOR_SELF_CHECK')) out.collaborator_self_check = tm;
    else if (body.includes('COLLABORATOR_HANDOFF')) { out.collaborator = tm; out.implementation = tm; }
    else if (body.includes('ADMIN_HANDOFF')) out.admin = tm;
    else if (body.includes('CONSULTANT_CLOSEOUT')) out.consultant = tm;
  }
  return out;
}

module.exports = {
  parseTeamModel, extractTeam, enforceRotationV2, extractRecordsFromComments,
  shouldSkip, checkRule1, checkRule2, checkRule3,
  OVERRIDE_LABEL_V1, OVERRIDE_LABEL_V2,
};
