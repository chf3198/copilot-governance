'use strict';

// accountable-team — persistent accountability ownership, kept distinct from the
// transient baton role label (Epic #2345; design synthesis #2346).
//
// The team-of-record persists across ALL ticket states including terminal,
// whereas a role:* label is present only on active, role-owned states. The two
// never share a namespace, which is what lets a closed ticket answer "who owns
// this?" without re-introducing an execution-role label on a terminal issue.

const ACCOUNTABLE_TEAMS = Object.freeze([
  'claude-code',
  'copilot',
  'codex',
  'antigravity',
]);

const ACCOUNTABLE_TEAM_LABEL_PREFIX = 'accountable-team:';

// The manager team-of-record fallback, matching the existing dashboard behavior
// that resolves historical ownership to the manager team when nothing else is known.
const DEFAULT_ACCOUNTABLE_TEAM = 'claude-code';

// Roles permitted to assign or modify the accountable-team label. Per the #2346
// authority rule this is decoupled from baton transitions: changing it is never a
// side effect of a role flip, and only the Manager or Admin role may do it.
const ACCOUNTABLE_TEAM_AUTHORITY = Object.freeze(['manager', 'admin']);

function isValidAccountableTeam(team) {
  return ACCOUNTABLE_TEAMS.includes(String(team || '').toLowerCase());
}

function canModifyAccountableTeam(role) {
  return ACCOUNTABLE_TEAM_AUTHORITY.includes(String(role || '').toLowerCase());
}

// "accountable-team:copilot" -> "copilot"; returns null for any other label or
// an unrecognized team value.
function teamFromLabel(label) {
  const text = String(label || '');
  if (!text.startsWith(ACCOUNTABLE_TEAM_LABEL_PREFIX)) return null;
  const team = text.slice(ACCOUNTABLE_TEAM_LABEL_PREFIX.length).toLowerCase();
  return isValidAccountableTeam(team) ? team : null;
}

// Parse the team out of a baton signing block's "Team&Model:" line, e.g.
// "Team&Model: claude-code:opus@local" -> "claude-code". Mirrors the parse shape
// used by scripts/global/megalint/signer-registry-check.js#parseTeamModel.
function teamFromSigningBlock(commentBody) {
  const match = String(commentBody || '').match(/Team&Model:\s*([^:\n]+):[^@\n]+@?\S*/i);
  if (!match) return null;
  const team = match[1].trim().toLowerCase();
  return isValidAccountableTeam(team) ? team : null;
}

// Resolution order (design synthesis #2346, section 4):
//   1. an explicit accountable-team:* label, else
//   2. the team in the most recent baton/closeout signing block, else
//   3. the default manager team-of-record.
// `comments` is an array of { body }, ordered oldest-first (GitHub default), so
// the most recent signing block is found by scanning from the end.
function resolveAccountableTeam(labels, comments) {
  const labelList = Array.isArray(labels) ? labels : [];
  for (const label of labelList) {
    const fromLabel = teamFromLabel(label);
    if (fromLabel) return { team: fromLabel, source: 'label' };
  }
  const commentList = Array.isArray(comments) ? comments : [];
  for (let index = commentList.length - 1; index >= 0; index -= 1) {
    const entry = commentList[index];
    const fromBlock = teamFromSigningBlock(entry && entry.body);
    if (fromBlock) return { team: fromBlock, source: 'signing-block' };
  }
  return { team: DEFAULT_ACCOUNTABLE_TEAM, source: 'default' };
}

module.exports = {
  ACCOUNTABLE_TEAMS,
  ACCOUNTABLE_TEAM_LABEL_PREFIX,
  DEFAULT_ACCOUNTABLE_TEAM,
  ACCOUNTABLE_TEAM_AUTHORITY,
  isValidAccountableTeam,
  canModifyAccountableTeam,
  teamFromLabel,
  teamFromSigningBlock,
  resolveAccountableTeam,
};
