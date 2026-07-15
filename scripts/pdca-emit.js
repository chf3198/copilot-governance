#!/usr/bin/env node
// pdca-emit — emit ISO/IEC 42001-aligned PDCA cycle artifact on Epic closeout.
// Per #1974 AC1-AC6. Reads an Epic via gh API, builds Plan/Do/Check/Act JSON,
// writes to ~/.megingjord/pdca/<epic-N>-closeout.json.
// G4: no credential surface — Epic body fields scrubbed pre-emit.
// G5: portable JSON; G6: degraded-mode embeds JSON in closeout body on disk write failure.

'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PDCA_DIR = path.join(os.homedir(), '.megingjord', 'pdca');
const CREDENTIAL_RE = /(api[_-]?key|token|password|secret|bearer)[\s:=]+["']?[\w\-.]{8,}/gi;

/** Fetch Epic issue JSON via gh CLI.
 * @param {number|string} num - Epic issue number.
 * @returns {object} parsed issue with body, comments, labels. */
function fetchEpic(num) {
  const json = execFileSync('gh',
    ['issue', 'view', String(num), '--json', 'number,title,body,comments,labels,closedAt,state'],
    { encoding: 'utf8' });
  return JSON.parse(json);
}

/** Remove credential-looking strings from text per OWASP secret patterns.
 * @param {string} text - raw text.
 * @returns {string} sanitized text with credential matches replaced. */
function sanitize(text) {
  return String(text || '').replace(CREDENTIAL_RE, '[REDACTED]');
}

/** Extract Plan cell from Epic body (scope + ACs).
 * @param {object} epic - Epic issue JSON.
 * @returns {object} {scope, acceptance_criteria}. */
function extractPlan(epic) {
  const body = sanitize(epic.body || '');
  const acRe = /^[-*]\s*\[[ x]\]\s*(.+)$/gim;
  const acs = [];
  let m;
  while ((m = acRe.exec(body)) !== null) acs.push(m[1].trim());
  return { scope: body.slice(0, 1000), acceptance_criteria: acs };
}

/** Extract Do cell — count handoff artifacts in comments as proxy for activity.
 * @param {object} epic - Epic issue JSON.
 * @returns {object} {handoff_counts, comment_count}. */
function extractDo(epic) {
  const comments = epic.comments || [];
  const counts = { manager: 0, collaborator: 0, admin: 0, consultant: 0 };
  for (const c of comments) {
    const b = c.body || '';
    if (/MANAGER_HANDOFF/.test(b)) counts.manager += 1;
    if (/COLLABORATOR_HANDOFF/.test(b)) counts.collaborator += 1;
    if (/ADMIN_HANDOFF/.test(b)) counts.admin += 1;
    if (/CONSULTANT_(EPIC_)?CLOSEOUT/.test(b)) counts.consultant += 1;
  }
  return { handoff_counts: counts, comment_count: comments.length };
}

/** Extract Check cell — locate CONSULTANT_EPIC_CLOSEOUT and parse rubric.
 * @param {object} epic - Epic issue JSON.
 * @returns {object} {closeout_present, rubric, verdict}. */
function extractCheck(epic) {
  const comments = epic.comments || [];
  const closeout = [...comments].reverse().find((c) =>
    /CONSULTANT_(EPIC_)?CLOSEOUT/.test(c.body || ''));
  if (!closeout) return { closeout_present: false, rubric: null, verdict: null };
  const body = closeout.body;
  const rubric = {};
  const goalRe = /G(\d+)\s*[:=]\s*(\d+)/g;
  let m;
  while ((m = goalRe.exec(body)) !== null) rubric[`G${m[1]}`] = parseInt(m[2], 10);
  const verdictMatch = body.match(/verdict\s*:\s*(\w+)/i);
  return { closeout_present: true, rubric, verdict: verdictMatch ? verdictMatch[1] : null };
}

/** Extract Act cell — anneal tickets filed mentioned in closeout.
 * @param {object} epic - Epic issue JSON.
 * @returns {object} {anneal_tickets, follow_ons}. */
function extractAct(epic) {
  const comments = epic.comments || [];
  const closeout = [...comments].reverse().find((c) =>
    /CONSULTANT_(EPIC_)?CLOSEOUT/.test(c.body || ''));
  if (!closeout) return { anneal_tickets: [], follow_ons: [] };
  const annealMatch = closeout.body.match(/anneal_tickets_filed:?\s*\[([^\]]*)\]/i);
  const anneal = annealMatch
    ? annealMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const followOnRe = /Refs\s+#(\d+)/g;
  const followOns = [];
  let m;
  while ((m = followOnRe.exec(closeout.body)) !== null) followOns.push(`#${m[1]}`);
  return { anneal_tickets: anneal, follow_ons: followOns };
}

/** Build the full PDCA artifact for an Epic.
 * @param {object} epic - Epic issue JSON.
 * @returns {object} PDCA structured artifact. */
function buildPdca(epic) {
  return {
    standard: 'ISO/IEC 42001 PDCA',
    epic: { number: epic.number, title: epic.title, closed_at: epic.closedAt, state: epic.state },
    generated_at: new Date().toISOString(),
    plan: extractPlan(epic),
    do: extractDo(epic),
    check: extractCheck(epic),
    act: extractAct(epic),
  };
}

/** Write PDCA artifact to disk; on failure caller may embed in closeout body.
 * @param {object} pdca - the artifact returned by buildPdca.
 * @returns {string|null} absolute path on success, null on disk error. */
function writePdca(pdca) {
  try {
    fs.mkdirSync(PDCA_DIR, { recursive: true });
    const p = path.join(PDCA_DIR, `epic-${pdca.epic.number}-closeout.json`);
    fs.writeFileSync(p, JSON.stringify(pdca, null, 2));
    return p;
  } catch (_e) {
    return null;
  }
}

/** CLI entry point: parse --epic N, fetch, build, write.
 * @param {string[]} argv - process argv.
 * @returns {number} 0 success, 1 missing arg, 2 disk failure (degraded). */
function main(argv) {
  const i = argv.indexOf('--epic');
  if (i === -1 || !argv[i + 1]) {
    console.error('Usage: pdca-emit --epic <N>');
    return 1;
  }
  const epic = fetchEpic(argv[i + 1]);
  const pdca = buildPdca(epic);
  const out = writePdca(pdca);
  if (out) {
    console.log(`pdca-emit: epic-${epic.number} → ${out}`);
    return 0;
  }
  console.log('DEGRADED:PDCA_INLINE_FALLBACK');
  console.log(JSON.stringify(pdca, null, 2));
  return 2;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { fetchEpic, sanitize, extractPlan, extractDo, extractCheck, extractAct, buildPdca, writePdca, CREDENTIAL_RE };
