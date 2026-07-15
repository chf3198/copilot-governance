'use strict';
// baton-independence.js — signer-independence for the Admin merge gate.
// #3532 established: independence PASSES iff EITHER (a) Admin vs Collaborator differ by
// Team&Model TEAM segment, OR (b) a VERIFIED cross-family consensus receipt. #3672 (F2+F3,
// Epic #3679) HARDENS both paths against manufactured/forged evidence surfaced live on
// #3673 / PR#3677:
//   F2 — a same-team persona/role-surname split, AND a self-asserted "waived"/"N/A"
//        disposition, are NEVER independence (`independence-self-waived` when self-waived).
//   F3 — a BARE "different team" claim is forgeable (a single agent can mint a foreign-team
//        signer), so path (a) alone NO LONGER passes: a genuinely-different team now ALSO
//        requires a verified cross-family receipt (b) OR a cryptographic authorship
//        attestation. Bare team-difference => `unattested-cross-team-claim` (FAIL).
// The unforgeable proof is therefore a verified receipt or an attestation — never prose.
// roleIdentity is retained for signer-display only; it does not decide independence.

const fs = require('fs');
const { teamSegmentOf, familyOfModel, verifyReceipt, RECEIPT_FIELD_RE,
  detectSelfWaive, verifyAuthorshipAttestation } = require('./cross-family-receipt');

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
  // #3672 (AC3 root cause): real baton artifacts head their marker with `## ` (see
  // baton-comment-build.js) — the previous `\s*${marker}\s*(\n|$)` did NOT match a
  // `## ADMIN_HANDOFF` header (## is not whitespace), so checkAdminIndependence silently
  // returned `missing-role-comment` (a skip/pass) on every real handoff, defeating the
  // #1591 admin-gate. Align to the canonical grammar (optional `## ` / `**` prefix, then
  // a word boundary) — the same tolerant anchor megalint's findAdminHandoff uses.
  const roleLine = new RegExp(`(^|\\n)\\s*(?:\\*\\*|##\\s+)?${marker}\\b`);
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

  const adminBody = admin.body || '';
  const collabTeam = teamSegmentOf(teamModelOf(collaborator));
  const adminTeam = teamSegmentOf(teamModelOf(admin));
  const teamsDiffer = Boolean(collabTeam && adminTeam && collabTeam !== adminTeam);

  // Independence PASSES only via an unforgeable proof (attestation or verified receipt).
  const proof = independenceProof(adminBody, teamModelOf(admin), opts);
  if (proof.ok) return { ok: true, reason: proof.reason, receipt: proof.receipt, families: proof.families };

  // FAIL — a bare team-difference, persona-surname, or "waived"/"N/A" disposition never
  // passes; report the most-specific reason so the operator sees exactly WHY.
  const reason = classifyIndependenceFailure(detectSelfWaive(adminBody), teamsDiffer, collabTeam, adminTeam);
  const ctx = { collabTeam, adminTeam, receiptReason: proof.reason };
  return { ok: false, reason, collabTeam, adminTeam, receiptReason: proof.reason,
    message: independenceFailMessage(reason, ctx) };
}

// The two unforgeable PASS paths (#3672): a cryptographic authorship attestation (reserved,
// mechanism deferred to #3682, injectable via opts.verifyAttestation) OR a VERIFIED
// cross-family consensus receipt — required for BOTH same- and different-team (F3). On
// failure, `reason` carries the receipt-verification reason for actionable messaging.
function independenceProof(adminBody, adminTeamModel, opts) {
  const att = verifyAuthorshipAttestation(adminBody, opts);
  if (att.ok) return { ok: true, reason: 'authorship-attested' };
  const receipt = (adminBody.match(RECEIPT_FIELD_RE) || [])[1] || null;
  const verify = opts.verify || verifyReceipt;
  const res = receipt
    ? verify(opts.issueNumber, receipt, familyOfModel(adminTeamModel),
        { kind: 'merge-consensus', ledger: opts.ledger })
    : { ok: false, reason: 'no-receipt' };
  if (res.ok) return { ok: true, reason: 'cross-family-consensus', receipt, families: res.families };
  return { ok: false, reason: res.reason };
}

// Most-specific denial reason (#3672). Precedence: self-waive > forged cross-team > same-team.
function classifyIndependenceFailure(selfWaived, teamsDiffer, collabTeam, adminTeam) {
  if (selfWaived) return 'independence-self-waived';
  if (teamsDiffer) return 'unattested-cross-team-claim';
  if (collabTeam && adminTeam) return 'same-team-no-valid-receipt';
  return 'no-independent-team-no-receipt';
}

// Human-readable, actionable denial per failure reason (#3672).
function independenceFailMessage(reason, ctx) {
  const need = 'independence requires a verified cross-family consensus receipt (or a ' +
    'cryptographic authorship attestation)';
  switch (reason) {
    case 'independence-self-waived':
      return 'signer-independence-check is self-waived (waived/N/A); a signer cannot waive ' +
        `its own independence check — ${need}.`;
    case 'unattested-cross-team-claim':
      return `Admin team "${ctx.adminTeam}" differs from Collaborator team "${ctx.collabTeam}", ` +
        'but a bare different-team claim is forgeable (a single agent can mint a foreign-team ' +
        `signer) — ${need} (receipt: ${ctx.receiptReason}).`;
    case 'same-team-no-valid-receipt':
      return `Admin and Collaborator share Team&Model team segment (${ctx.adminTeam}); ` +
        `${need} (receipt: ${ctx.receiptReason}). Persona-surname difference alone is insufficient.`;
    default:
      return `No parseable independent signing team and no valid receipt — ${need} ` +
        `(receipt: ${ctx.receiptReason}).`;
  }
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
