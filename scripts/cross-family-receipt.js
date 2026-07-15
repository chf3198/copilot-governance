'use strict';
// cross-family-receipt.js (#3532) — un-forgeable cross-model consensus receipt: a
// 16-hex sha256 over the ACTUAL panel responses logged to an append-only,
// hash-chained, committed ledger. A single agent cannot mint a passing receipt
// without >=2 distinct non-authoring families actually voting (each able to
// REJECT). CI re-verifies from committed evidence. Boundary: the hash-chain makes
// selective tampering detectable + the ledger auditable; genuine-ness ultimately
// rests on responses being real provider outputs (whole-chain forgery needs crypto
// provenance — a follow-on, mirrors cross-team-response-fidelity's residual gap).
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const LEDGER = path.join(__dirname, '..', '..', 'governance', 'cross-family-consensus.jsonl');
const RECEIPT_RE = /^[0-9a-f]{16}$/;
// Single source of truth for the `cross_family_receipt:` field format (#3532
// reconciliation) — shared by collaborator-handoff (kind=review, #2904) and the
// admin merge-consensus path (kind=merge-consensus). One algorithm, two kinds.
const RECEIPT_FIELD_RE = /cross_family_receipt\s*:\s*([0-9a-f]{16})/i;
// provider -> model family. The authoring family must NOT appear in a valid panel.
const PROVIDER_FAMILY = Object.freeze({
  gemini: 'google', 'openrouter-free': 'meta', groq: 'meta', cerebras: 'meta',
  mistral: 'mistral', 'github-models': 'openai', nvidia: 'meta', sambanova: 'meta',
});
const TEAM_FAMILY = Object.freeze({
  'claude-code': 'anthropic', codex: 'openai', copilot: 'openai', antigravity: 'google',
});

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const teamSegmentOf = (tm) => (typeof tm === 'string' && tm.includes(':') ? tm.split(':')[0].trim().toLowerCase() : null);

// #3672 (F2): a self-asserted "waived" / "N/A" / "not-applicable" independence
// disposition is NEVER a pass — a signer cannot waive its own independence check.
// Matches e.g. `signer-independence-check: PASS (... model-diversity waived ...)` or
// `signer-independence-check: N/A` (the #1591 / PR#3668 case). Bounded to the field's
// own line so unrelated prose elsewhere in the comment cannot trip it.
const SELF_WAIVE_RE =
  /signer[_-]independence[_-]check\s*:\s*[^\n]*\b(?:waiv\w*|n\s*\/?\s*a|not[-\s]?applicable)\b/i;
const detectSelfWaive = (body) => SELF_WAIVE_RE.test(String(body || ''));

// #3672 (F3): a bare "different Team&Model team" claim is FORGEABLE — a single agent
// can mint a foreign-team signer (the #3673 / PR#3677 "perfect forgery"). Independence
// therefore requires a VERIFIED cross-family receipt OR a cryptographic authorship
// attestation proving the cross-team artifact was genuinely authored by the asserted
// team. The attestation MECHANISM (a committed per-team public-key registry + ed25519
// verify) is the deliverable of the #3682 research child; this hook is FAIL-CLOSED
// today — present-but-unverifiable crypto fields do NOT pass. Real infra / tests inject
// a verifier via opts.verifyAttestation(body, opts) -> { ok, reason }.
const CRYPTO_ATTESTATION_RE = /Crypto-Signature\s*:/i;
function verifyAuthorshipAttestation(body, opts = {}) {
  if (typeof opts.verifyAttestation === 'function') return opts.verifyAttestation(String(body || ''), opts);
  if (CRYPTO_ATTESTATION_RE.test(String(body || ''))) return { ok: false, reason: 'attestation-unverifiable-no-registry' };
  return { ok: false, reason: 'no-attestation' };
}

function familyOfModel(teamModel) {
  if (!teamModel) return 'unknown';
  const team = teamSegmentOf(teamModel);
  const model = ((teamModel.match(/:([^@]+)@/) || [])[1] || teamModel.split(':')[1] || '').toLowerCase();
  if (model.includes('claude')) return 'anthropic';
  if (/gpt|^o[0-9]/.test(model)) return 'openai';
  if (model.includes('gemini')) return 'google';
  if (model.includes('llama')) return 'meta';
  if (model.includes('qwen')) return 'qwen';
  if (model.includes('mistral')) return 'mistral';
  return TEAM_FAMILY[team] || 'unknown';
}
// Deterministic per-entry body the receipt + chain bind to (fixed field order).
function entryBody(e) {
  return JSON.stringify([e.ticket, e.seq, e.kind, e.provider, e.family, e.verdict,
    e.prompt_sha256, e.response_sha256]);
}
const chainHash = (prevChain, e) => sha((prevChain || '') + entryBody(e));
// Receipt = 16-hex sha256 over the ordered entry bodies for a ticket+kind slice.
function computeReceipt(entries) {
  return sha([...entries].sort((a, b) => a.seq - b.seq).map(entryBody).join('\n')).slice(0, 16);
}
function readLedger(ledgerPath = LEDGER) {
  try {
    return fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}
// Recompute every chain link top-to-bottom; any mismatch => tampered.
function verifyChain(all) {
  let prev = '';
  for (const e of all) {
    if (chainHash(prev, e) !== e.chain) return false;
    prev = e.chain;
  }
  return true;
}
// Append one panel response; seq is per ticket+kind; chain extends the whole file.
function appendEntry(rec, ledgerPath = LEDGER) {
  const all = readLedger(ledgerPath);
  const prev = all.length ? all[all.length - 1].chain : '';
  const seq = all.filter((e) => e.ticket === rec.ticket && e.kind === rec.kind).length;
  const e = { ...rec, seq };
  e.chain = chainHash(prev, e);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(e) + '\n');
  return e;
}

// Full re-verification used by both baton-independence and the CI validator.
function verifyReceipt(ticket, receipt, authoringFamily, opts = {}) {
  const kind = opts.kind || 'merge-consensus';
  const minFamilies = opts.minFamilies || 2;
  if (!receipt || !RECEIPT_RE.test(String(receipt))) return { ok: false, reason: 'receipt-format-invalid' };
  const all = opts.ledger || readLedger(opts.ledgerPath);
  if (!all.length) return { ok: false, reason: 'ledger-empty' };
  if (!verifyChain(all)) return { ok: false, reason: 'ledger-tampered' };
  const slice = all.filter((e) => e.ticket === ticket && e.kind === kind);
  if (slice.length < minFamilies) return { ok: false, reason: 'insufficient-panel' };
  if (computeReceipt(slice) !== receipt) return { ok: false, reason: 'receipt-mismatch' };
  const families = [...new Set(slice.map((e) => e.family))];
  if (families.length < minFamilies) return { ok: false, reason: 'insufficient-family-diversity', families };
  if (authoringFamily && families.includes(authoringFamily)) return { ok: false, reason: 'authoring-family-in-panel', families };
  if (!slice.every((e) => e.verdict === 'PASS')) return { ok: false, reason: 'consensus-not-pass', families };
  return { ok: true, reason: 'cross-family-consensus-verified', families, panel: slice.length };
}

module.exports = {
  LEDGER, RECEIPT_RE, RECEIPT_FIELD_RE, PROVIDER_FAMILY, TEAM_FAMILY, sha, teamSegmentOf,
  familyOfModel, entryBody, chainHash, computeReceipt, readLedger, verifyChain, appendEntry, verifyReceipt,
  SELF_WAIVE_RE, detectSelfWaive, verifyAuthorshipAttestation,
};
