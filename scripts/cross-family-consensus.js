#!/usr/bin/env node
'use strict';
// tier: 4
// cross-family-consensus.js (#3532) — run a >=2-distinct-family $0 panel to
// authorize an Admin merge as INDEPENDENT verification, and log the actual
// provider responses to the append-only hash-chained ledger. Prints the receipt
// the Admin cites in ADMIN_HANDOFF (cross_family_receipt). Reuses free-cloud
// providers (never a paid model). Each panelist can REJECT; any REJECT or a
// too-narrow family set yields no valid receipt.
//   node cross-family-consensus.js --ticket 3532 [--kind merge-consensus|review] [--summary "..."]
require('./load-local-env').loadLocalEnvOnce();
const { callProvider, providerOrder, PROVIDERS } = require('./free-cloud-dispatch');
const rc = require('./cross-family-receipt');

const MAX_RESPONSE_CHARS = 4000;
const DEFAULT_FAMILIES = 2;

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 2) if (argv[i]?.startsWith('--')) parsed[argv[i].slice(2)] = argv[i + 1] || '';
  return parsed;
}

// Candidate providers with a key present, ordered (policy first, then the rest),
// excluding the authoring family. Liveness is resolved at call time (dead
// providers are skipped) so a 429/404 never blocks a distinct family.
function candidates(authoringFamily) {
  const order = [...new Set([...providerOrder(), ...Object.keys(PROVIDERS)])];
  return order.filter((name) => {
    const fam = rc.PROVIDER_FAMILY[name];
    return fam && fam !== authoringFamily && PROVIDERS[name] && process.env[PROVIDERS[name].envKey];
  });
}

const PROMPT = (summary) =>
  `You are an INDEPENDENT cross-family reviewer authorizing a governance merge.\n` +
  `Change under review (ticket #${summary.ticket}): ${summary.text}\n` +
  `Decide if this change is sound and safe to merge. You MAY reject.\n` +
  `Reply with a one-line rationale, then a final line exactly: VERDICT: PASS or VERDICT: REJECT`;

function parseVerdict(text) {
  const m = String(text || '').match(/VERDICT:\s*(PASS|REJECT)/i);
  return m ? m[1].toUpperCase() : 'REJECT'; // fail-safe: unparseable != authorization
}

// One LIVE provider per distinct family, until `want` families (or candidates exhaust).
// Dead providers (429/404) are skipped so a transient outage never blocks a family.
async function collectPanel(prompt, authoringFamily, want) {
  const byFamily = new Map();
  const attempts = [];
  for (const name of candidates(authoringFamily)) {
    const fam = rc.PROVIDER_FAMILY[name];
    if (byFamily.has(fam)) continue;
    const attempt = await callProvider(name, prompt, {});
    attempts.push(`${name}:${attempt.ok ? 'ok' : attempt.reason}`);
    if (!attempt.ok) continue; // real responses only enter the receipt
    byFamily.set(fam, { provider: name, family: fam, verdict: parseVerdict(attempt.content), content: attempt.content });
    if (byFamily.size >= want) break;
  }
  return { members: [...byFamily.values()], attempts };
}

async function run(opts) {
  const ticket = Number(opts.ticket);
  const kind = opts.kind || 'merge-consensus';
  const want = Number(opts.minFamilies) || DEFAULT_FAMILIES;
  const authoringFamily = rc.familyOfModel(`${process.env.HAMR_TEAM || 'claude-code'}:${process.env.HAMR_MODEL || 'claude'}@local`);
  const prompt = PROMPT({ ticket, text: opts.summary || `ticket #${ticket} governance change` });
  const promptSha = rc.sha(prompt);
  const { members, attempts } = await collectPanel(prompt, authoringFamily, want);
  if (members.length < want) {
    return { ok: false, reason: 'insufficient-live-families', authoringFamily, want, got: members.length, attempts };
  }
  for (const m of members) {
    rc.appendEntry({ ticket, kind, provider: m.provider, family: m.family, verdict: m.verdict,
      ts: new Date().toISOString(), prompt_sha256: promptSha, response_sha256: rc.sha(m.content),
      response: m.content.slice(0, MAX_RESPONSE_CHARS) });
  }
  const receipt = rc.computeReceipt(rc.readLedger().filter((e) => e.ticket === ticket && e.kind === kind));
  const consensus = members.every((m) => m.verdict === 'PASS') ? 'PASS' : 'REJECT';
  return { ok: consensus === 'PASS', receipt, kind, consensus, authoringFamily,
    families: members.map((m) => m.family), panel: members.map((m) => ({ provider: m.provider, family: m.family, verdict: m.verdict })), attempts };
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then((out) => {
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 1);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { run, candidates, parseVerdict, PROMPT };
