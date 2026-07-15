'use strict';
// Rule definitions for collaborator-self-check (Epic #1568 AC-2, #1571).
// Pure functions; returns { id, ok, evidence }.

const BRANCH_RE = /^(feat|fix|hotfix)\/[0-9]+-|^(chore|skill)\/[a-z0-9]|^main$|^develop$/;
const FLAW_RE = /\b(flaw|bug|failure|incident)\b|side-?effect|worked around|I had to/i;
const CITE_RE = /#\d+|incidents\.jsonl|pattern_id\s*:|anneal_tickets_filed\s*:|memory\//i;

// #1580: structured-field format rules delegate to the single-source schema module
// (collaborator-handoff-schema.js) so the local self-check and the server-side
// megalint gate validate the same field contract and cannot drift apart.
const Schema = require('./collaborator-handoff-schema.js');

function ok(id, evidence = '') { return { id, ok: true, evidence }; }
function fail(id, evidence) { return { id, ok: false, evidence }; }

const branchNamePrefix = b => BRANCH_RE.test(b || '')
  ? ok('branch-name-prefix', b)
  : fail('branch-name-prefix', `branch '${b}' violates feat|fix|hotfix|chore|skill prefix`);

const refsThisTicketFirst = (prBody, ticketNumber) => {
  for (const line of (prBody || '').split('\n')) {
    const m = line.match(/^Refs\s+#(\d+)/);
    if (m) return +m[1] === +ticketNumber
      ? ok('refs-this-ticket-first', `first Refs #${m[1]}`)
      : fail('refs-this-ticket-first', `first Refs #${m[1]} != #${ticketNumber}`);
  }
  return fail('refs-this-ticket-first', 'no Refs #N line in PR body');
};

const closesAndRefsBothPresent = (prBody, n) => {
  const closes = new RegExp(`Closes\\s+#${n}\\b`).test(prBody || '');
  const refs = new RegExp(`Refs\\s+#${n}\\b`).test(prBody || '');
  return closes && refs
    ? ok('closes-and-refs-both-present', `Closes #${n} + Refs #${n}`)
    : fail('closes-and-refs-both-present', `Closes=${closes} Refs=${refs}`);
};

const tddSpecInDiffWhenRequired = (testStrategy, prFiles) => {
  if (testStrategy !== 'tdd-pyramid' && testStrategy !== 'tdd-trophy') {
    return ok('tdd-spec-in-diff-when-required', `strategy=${testStrategy}`);
  }
  return (prFiles || []).some(f => /tests\/.*\.spec\.(js|ts)$/.test(f))
    ? ok('tdd-spec-in-diff-when-required', 'spec file in diff')
    : fail('tdd-spec-in-diff-when-required', 'no tests/**/*.spec.{js,ts} in diff');
};

const noProseColonCollision = handoffBody => {
  const { collision, violators } = Schema.detectProseColonCollision(handoffBody);
  return collision
    ? fail('no-prose-colon-collision', violators.join('; '))
    : ok('no-prose-colon-collision', 'clean');
};

const noMarkdownBoldOnTestStrategy = handoffBody => Schema.testStrategyMarkdownBold(handoffBody)
  ? fail('no-markdown-bold-on-test-strategy', 'wrapped in markdown bold')
  : ok('no-markdown-bold-on-test-strategy', 'plain');

const flawMarkerCitations = handoffBody => {
  const lines = (handoffBody || '').split('\n');
  const violators = [];
  for (let idx = 0; idx < lines.length; idx++) {
    if (!FLAW_RE.test(lines[idx])) continue;
    const win = lines.slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 3));
    if (!win.some(l => CITE_RE.test(l))) violators.push(`line ${idx + 1}`);
  }
  return violators.length === 0
    ? ok('flaw-marker-citations', 'all marker mentions cited')
    : fail('flaw-marker-citations', violators.join(', '));
};

const readabilityNoNewWarnings = r => {
  if (!r || r.baseline == null || r.current == null) return ok('readability-no-new-warnings', 'no data (skipped)');
  return r.current <= r.baseline
    ? ok('readability-no-new-warnings', `${r.current} <= ${r.baseline}`)
    : fail('readability-no-new-warnings', `${r.current} > ${r.baseline}`);
};

const allAcceptanceCriteriaTicked = (mh, ch) => {
  const mhAcs = ((mh || '').match(/^- \[[ x]\]\s+(.+)$/gim) || []).length;
  const chTicked = ((ch || '').match(/^- \[x\]\s+/gim) || []).length;
  return chTicked >= mhAcs
    ? ok('all-acceptance-criteria-ticked', `${chTicked} >= ${mhAcs}`)
    : fail('all-acceptance-criteria-ticked', `${chTicked} < ${mhAcs}`);
};

const modelDiversityProspectiveAdmin = (own, admin) => {
  if (!admin || !own) return ok('model-diversity-prospective-admin', 'admin team-model not supplied (skipped)');
  return own !== admin
    ? ok('model-diversity-prospective-admin', `${own} != ${admin}`)
    : fail('model-diversity-prospective-admin', `both on ${own}`);
};

const mcpLoadCheck = (handoffBody, env) => {
  if ((env || process.env).MEGINGJORD_MCP_DISABLED === '1') {
    return /MEGINGJORD_MCP_DISABLED=1/.test(handoffBody || '')
      ? ok('mcp-load-check', 'opt-out cited')
      : fail('mcp-load-check', 'opt-out env set but rationale missing in handoff');
  }
  return /mcp__github__|MCP/i.test(handoffBody || '')
    ? ok('mcp-load-check', 'mcp usage detected')
    : ok('mcp-load-check', 'no mcp marker (advisory; gh CLI fallback assumed)');
};

module.exports = {
  branchNamePrefix, refsThisTicketFirst, closesAndRefsBothPresent,
  tddSpecInDiffWhenRequired, noProseColonCollision, noMarkdownBoldOnTestStrategy,
  flawMarkerCitations, readabilityNoNewWarnings, allAcceptanceCriteriaTicked,
  modelDiversityProspectiveAdmin, mcpLoadCheck,
};
