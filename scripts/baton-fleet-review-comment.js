'use strict';
// tier: 3
// baton-fleet-review-comment — canonical red-team comment formatter
// Refs #2179 (Phase-1 P1-2 of Epic #2041). Consumes dispatchRedTeam output (#2175 P1-1).
// Per Phase-0 dog-food finding: per-iteration table = aggregation primitive.

const ARTIFACT_HEADER_BY_TYPE = {
  'epic-scope': 'epic-scope review',
  'child-implementation': 'child-implementation review',
  'collaborator-handoff': 'the-collaborator-handoff review',
  'admin-handoff': 'the-admin-handoff review',
  'pr-diff': 'PR-diff review',
  'instruction-edit': 'instruction-edit review',
  'consultant-closeout': 'the-consultant-closeout review',
};

const VERDICT_RE = /^(?:[-*]\s*)?\*?\*?(ACCEPT|REJECT|PARTIAL)\*?\*?[:\s-]+(.+)$/i;

function classifyFinding(raw) {
  const match = String(raw || '').trim().match(VERDICT_RE);
  if (!match) return { verdict: 'UNCLASSIFIED', text: String(raw || '').trim() };
  return { verdict: match[1].toUpperCase(), text: match[2].trim() };
}

function renderFindingsTable(findings) {
  if (!findings || !findings.length) return '_No findings._';
  const rows = findings.map((finding, idx) => {
    const { verdict, text } = classifyFinding(finding.raw || finding);
    const escaped = String(text).replace(/\|/g, '\\|');
    return `| ${idx + 1} | ${verdict} | ${escaped} |`;
  });
  return ['| # | Verdict | Finding |', '|---|---|---|', ...rows].join('\n');
}

function formatRedTeamComment({
  findings = [],
  artifactType = 'pr-diff',
  dispatchModel = 'qwen2.5-coder:32b',
  host = '100.91.113.16:11434',
  iterationN = 1,
  ticket = null,
  warning = null,
} = {}) {
  const header = ARTIFACT_HEADER_BY_TYPE[artifactType] || 'review';
  const teamModel = `ollama:${dispatchModel}@fleet/${host}`;
  const lines = [
    `## Fleet Red-Team Review (iteration ${iterationN}) — ${header}`,
    ticket ? `ticket: ${ticket}` : null,
    '',
    warning ? `> **Note**: ${warning}` : null,
    warning ? '' : null,
    '### Findings',
    '',
    renderFindingsTable(findings),
    '',
    'This review was produced by a HAMR-routed fleet model (per Epic #2041 systematization).',
    '',
    `Signed-by: ollama-${dispatchModel.split(':')[0]}-redteam`,
    `Team&Model: ${teamModel}`,
    'Role: red-team-reviewer',
    `verification-timestamp: ${new Date().toISOString()}`,
  ].filter((line) => line !== null);
  return lines.join('\n');
}

module.exports = { formatRedTeamComment, classifyFinding, renderFindingsTable, ARTIFACT_HEADER_BY_TYPE };
