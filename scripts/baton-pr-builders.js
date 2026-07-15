'use strict';
// Programmatic builders for the 3 NON-comment baton artifacts (Epic #2037 P1.2,
// Refs #2672): PR body, CHANGELOG fragment, commit trailers. Pure + deterministic
// (byte-identical for identical input). Reuses deriveSigner from #2671's
// baton-artifact-builder — no parallel signer logic. Encodes the recurring
// Refs-ordering / title-length / signer-invention / fragment-naming defects as
// data rather than prose the operator must remember.
const { deriveSigner } = require('./baton-artifact-builder');

const MAX_SUBJECT = 60; // pr-title.yml subjectPattern ^.{1,60}$ (subject after CC prefix)
const CC_PREFIX = /^[a-z]+(?:\([^)]+\))?!?:\s+/; // conventional-commit type(scope):
const CHANGELOG_SECTIONS = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];
// Back-compat auto-close form (global-standards merge-evidence contract): Closes/Fixes/Resolves #N.
const CLOSE_FORM = /^(?:Closes|Fixes|Resolves) #\d+$/;

/** Normalize a ticket ref to its bare digits; throws on non-numeric input. */
function ticketNum(ticket) {
  const bare = String(ticket === null || ticket === undefined ? '' : ticket).replace(/^#/, '');
  if (!/^\d+$/.test(bare)) throw new Error(`invalid ticket: ${JSON.stringify(ticket)}`);
  return bare;
}

/** Validate a PR title against pr-title.yml: CC prefix required, subject 1-60 chars. */
function validatePrTitle(title) {
  const trimmed = String(title || '').trim();
  if (!CC_PREFIX.test(trimmed)) throw new Error(`PR title needs a Conventional-Commit prefix: "${trimmed}"`);
  const subject = trimmed.replace(CC_PREFIX, '');
  if (subject.length < 1 || subject.length > MAX_SUBJECT) {
    throw new Error(`PR title subject must be 1-${MAX_SUBJECT} chars (got ${subject.length}): "${subject}"`);
  }
  return trimmed;
}

/** Build the commit-trailer block (Refs + derived signer trailers) for a ticket. */
function buildCommitTrailers({ teamModel, role, ticket }) {
  const num = ticketNum(ticket);
  const signer = deriveSigner(teamModel, role); // derived — rejects hand-typed alias
  return [`Refs #${num}`, '', `AI-Signature: ${signer}`, `AI-Team-Model: ${teamModel}`, `AI-Role: ${role}`].join('\n');
}

/** Build a CHANGELOG fragment named per ticket; validates the Keep-a-Changelog section. */
function buildChangelogFragment({ ticket, section, entry }) {
  const num = ticketNum(ticket); // fragment is named per the ticket — .changes/unreleased/<N>.md
  if (!CHANGELOG_SECTIONS.includes(section)) {
    throw new Error(`section must be one of ${CHANGELOG_SECTIONS.join('/')}: got ${section}`);
  }
  const entries = (Array.isArray(entry) ? entry : [entry]).filter((item) => String(item || '').trim());
  if (!entries.length) throw new Error('changelog fragment needs at least one entry');
  const body = entries.map((item) => `- ${String(item).trim()}`).join('\n');
  return { path: `.changes/unreleased/${num}.md`, content: `### ${section}\n${body}\n` };
}

/**
 * Assemble a PR body: Refs-first (validator regex /Refs\s+#(\d+)/ must match first),
 * merge-evidence line, then the 3 baton-artifact strings (baton-gates CI requires them).
 */
function buildPrBody({
  ticket, title, lane, testStrategy, summary,
  artifacts = {}, siblings = [], mergeEvidence = 'deferred-final',
}) {
  const num = ticketNum(ticket);
  validatePrTitle(title);
  const lines = [`Refs #${num}`];
  if (mergeEvidence === 'deferred-final') lines.push(`merge-evidence-deferred-final: #${num}`);
  else if (mergeEvidence) { // back-compat auto-close form — reject anything that isn't a known gate form
    if (!CLOSE_FORM.test(mergeEvidence)) {
      throw new Error(`mergeEvidence must be 'deferred-final' or a Closes/Fixes/Resolves #N line: "${mergeEvidence}"`);
    }
    lines.push(mergeEvidence);
  }
  lines.push('', '## Summary', String(summary || '').trim(), '', `lane: ${lane}`, `test_strategy: ${testStrategy}`);
  if (siblings.length) lines.push(`siblings: ${siblings.map((sib) => `#${ticketNum(sib)}`).join(', ')}`);
  lines.push('');
  for (const key of ['collaborator', 'admin', 'consultant']) {
    if (artifacts[key]) lines.push(String(artifacts[key]).trim(), '');
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

module.exports = {
  buildPrBody, buildChangelogFragment, buildCommitTrailers, validatePrTitle,
  CHANGELOG_SECTIONS, MAX_SUBJECT,
};
