'use strict';
// baton-independence.js — signer-independence for the Admin merge gate.
// #3532 (Client design decision): independence PASSES iff EITHER (a) Admin vs
// Collaborator differ by Team&Model TEAM segment (genuine cross-team signing),
// OR (b) a VERIFIED cross-family consensus receipt is present. A same-team
// persona-split (differing surnames, one agent) with NO valid receipt FAILS —
// closing the #3518/#3521 self-satisfiable loophole. roleIdentity is retained
// for signer-display only; it no longer decides independence.

const fs = require('fs');
const { teamSegmentOf, familyOfModel, verifyReceipt, RECEIPT_FIELD_RE } = require('./cross-family-receipt');

/**
 * Return the best available signer identity from a baton comment (display only).
 */
function roleIdentity(comment) {
  const body = comment.body || '';
  const patterns = [
    /AI-Signature:\s*([^\n]+)/i,
    /Signed-by:\s*([^\n]+)/i,
    /AI-Team-Model:\s*([^\n]+)/i,
    /Team&Model:\s*([^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) return match[1].trim();
  }
  return (comment.author || '').trim();
}

function findRoleComment(comments, marker) {
  const roleLine = new RegExp(`(^|\\n)\\s*${marker}\\s*(\\n|$)`);
  return [...comments].reverse().find(comment => roleLine.test(comment.body || ''));
}

// Team&Model literal from a comment (accepts canonical + AI-Team-Model trailer).
function teamModelOf(comment) {
  const body = (comment && comment.body) || '';
  const m = body.match(/Team&Model:\s*([^\n]+)/i) || body.match(/AI-Team-Model:\s*([^\n]+)/i);
  return m ? m[1].trim() : null;
}

/**
 * Validate collaborator/admin handoffs are genuinely independent.
 * @param {{body?: string, author?: string}[]} comments GitHub issue comments.
 * @param {{issueNumber?: number, ledger?: object[], verify?: function}} [opts]
 * @returns {{ok: boolean, reason: string, message?: string}} Gate result.
 */
function checkAdminIndependence(comments, opts = {}) {
  const collaborator = findRoleComment(comments, 'COLLABORATOR_HANDOFF');
  const admin = findRoleComment(comments, 'ADMIN_HANDOFF');
  if (!collaborator || !admin) return { ok: true, reason: 'missing-role-comment' };

  const collabTeam = teamSegmentOf(teamModelOf(collaborator));
  const adminTeam = teamSegmentOf(teamModelOf(admin));
  // (a) genuine cross-team signing — independent by construction.
  if (collabTeam && adminTeam && collabTeam !== adminTeam) {
    return { ok: true, reason: 'independent-team', collabTeam, adminTeam };
  }
  // (b) same team (or unparseable) — require a VERIFIED cross-family consensus receipt.
  const receipt = ((admin.body || '').match(RECEIPT_FIELD_RE) || [])[1] || null;
  const verify = opts.verify || verifyReceipt;
  const res = receipt
    ? verify(opts.issueNumber, receipt, familyOfModel(teamModelOf(admin)),
        { kind: 'merge-consensus', ledger: opts.ledger })
    : { ok: false, reason: 'no-receipt' };
  if (res.ok) return { ok: true, reason: 'cross-family-consensus', receipt, families: res.families };
  return {
    ok: false,
    reason: collabTeam && adminTeam ? 'same-team-no-valid-receipt' : 'no-independent-team-no-receipt',
    collabTeam, adminTeam, receiptReason: res.reason,
    message:
      `Admin and Collaborator share Team&Model team segment (${adminTeam || 'unparseable'}); ` +
      'independence requires a genuinely different signing TEAM or a verified cross-family ' +
      `consensus receipt (receipt: ${res.reason}). Persona-surname difference alone is insufficient.`,
  };
}

function main() {
  const argv = process.argv;
  const file = argv[argv.indexOf('--comments') + 1];
  const issIdx = argv.indexOf('--issue');
  const issueNumber = issIdx !== -1 ? Number(argv[issIdx + 1]) : undefined;
  const comments = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = checkAdminIndependence(comments, { issueNumber });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { checkAdminIndependence, roleIdentity, findRoleComment, teamModelOf };
