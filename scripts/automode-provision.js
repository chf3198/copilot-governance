#!/usr/bin/env node
'use strict';
// #3342 — One-time provisioning of the Claude Code auto-mode authorization that
// lets the Admin baton role merge a reviewed PR and the Consultant close the
// issue WITHOUT per-task client auth. This is environment-OWNER configuration
// (run once at setup / folded into hamr:activate), NOT a per-task act and NOT a
// merge approval. Per Claude Code docs, a permissions.allow rule cannot suppress
// the auto-mode classifier; the documented override is the `autoMode` prose block,
// and its agent-immutable home is managed settings.
//
// Usage:
//   node automode-provision.js --check     # readiness only (no write)
//   node automode-provision.js --apply     # install (managed -> ~/.claude fallback)
//   node automode-provision.js --verify    # confirm the rules are present + active
//
// Rollback: remove the drop-in file, or the autoMode key from ~/.claude/settings.json.

const fs = require('fs');
const os = require('os');
const path = require('path');

const MANAGED_DROPIN = '/etc/claude-code/managed-settings.d/megingjord-baton.json';
const USER_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

// The baton authorization, as auto-mode PROSE rules (classifier consumes prose).
// Scoped: only a reviewed PR (CONSULTANT_CLOSEOUT + green CI) is covered — the
// existing baton-authority/merge gate remains the mechanical precondition, so this
// is NOT a blanket self-merge license.
const BATON_AUTOMODE = {
  autoMode: {
    allow: [
      '$defaults',
      'policy:megingjord-baton-closeout-v1 (see instructions/feature-completion-governance.instructions.md): '
        + 'Merging a pull request whose linked issue carries a CONSULTANT_CLOSEOUT and whose required CI '
        + 'checks are green is allowed — this is the Admin baton role; the Consultant is the independent reviewer.',
      'policy:megingjord-baton-closeout-v1: Closing a GitHub issue after its CONSULTANT_CLOSEOUT is posted '
        + 'is allowed — this is the Consultant baton role.',
      'policy:megingjord-baton-closeout-v1 (#3714): Posting (authoring) a CONSULTANT_CLOSEOUT on a '
        + 'pull request the operator itself authored is allowed — this is the Consultant baton role — '
        + 'ONLY WHEN the closeout carries a valid cross_family_verdict (ACCEPT|PARTIAL|REJECT — '
        + 'model@host — rationale) backed by a VERIFIED cross-family consensus receipt in the committed '
        + 'ledger governance/cross-family-consensus.jsonl (>=2 non-authoring families, each able to '
        + 'REJECT) AND required CI minus the consultant gate is green. A same-family-only closeout with '
        + 'no verified receipt is NOT covered and still escalates/blocks (anti-self-approval preserved). '
        + 'This is an autonomously-resolvable baton step (free cross-family panel), never a client prompt.',
    ],
  },
};

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// Deep, non-clobbering merge of the autoMode.allow array (dedupe by string).
function mergeAutoMode(existing) {
  const base = existing && typeof existing === 'object' ? existing : {};
  const prevAllow = (base.autoMode && Array.isArray(base.autoMode.allow)) ? base.autoMode.allow : [];
  const merged = [...prevAllow];
  for (const rule of BATON_AUTOMODE.autoMode.allow) if (!merged.includes(rule)) merged.push(rule);
  return { ...base, autoMode: { ...(base.autoMode || {}), allow: merged } };
}

function targetFor() {
  // Prefer agent-immutable managed drop-in; fall back to user settings.
  const managedDir = path.dirname(MANAGED_DROPIN);
  try { fs.accessSync(managedDir, fs.constants.W_OK); return { path: MANAGED_DROPIN, scope: 'managed' }; }
  catch { /* not writable / absent */ }
  try { fs.mkdirSync(path.dirname(USER_SETTINGS), { recursive: true });
    fs.accessSync(path.dirname(USER_SETTINGS), fs.constants.W_OK);
    return { path: USER_SETTINGS, scope: 'user' }; }
  catch { return null; }
}

function check() {
  const dest = targetFor();
  if (!dest) return { ok: false, reason: 'no-writable-settings-path',
    hint: 'Read-only/container FS: bake the drop-in into the image or pass --settings <path> at launch.' };
  return { ok: true, target: dest.path, scope: dest.scope };
}

// Owner-configuration audit record (event_type distinct from any merge-approval).
function audit(action, target, scope) {
  try {
    const { emitV3 } = require('./event-schema-v3');
    const { redactEvent } = require('./log-redaction');
    const ev = redactEvent({
      ts: new Date().toISOString(), version: 3, service: 'automode-provision', env: 'local',
      event: 'automode_provisioned', event_type: 'owner-configuration', action,
      target_scope: scope, installer: os.userInfo().username,
      content_hash: require('crypto').createHash('sha256')
        .update(JSON.stringify(BATON_AUTOMODE)).digest('hex').slice(0, 16),
    });
    emitV3(ev, path.join(__dirname, '..', '..', 'dashboard', 'events.jsonl'));
  } catch { /* catch-empty: audit is best-effort; never block provisioning */ }
}

function apply() {
  const dest = targetFor();
  if (!dest) return { ok: false, reason: 'no-writable-settings-path' };
  const merged = mergeAutoMode(readJson(dest.path) || {});
  fs.mkdirSync(path.dirname(dest.path), { recursive: true });
  fs.writeFileSync(dest.path, JSON.stringify(merged, null, 2) + '\n');
  audit('apply', dest.path, dest.scope);
  return { ok: true, target: dest.path, scope: dest.scope };
}

function verify() {
  for (const file of [MANAGED_DROPIN, USER_SETTINGS]) {
    const data = readJson(file);
    const allow = data && data.autoMode && Array.isArray(data.autoMode.allow) ? data.autoMode.allow : [];
    const present = BATON_AUTOMODE.autoMode.allow.filter(r => r !== '$defaults').every(r => allow.includes(r));
    if (present) return { ok: true, active_source: file };
  }
  return { ok: false, reason: 'baton-automode-rules-not-found' };
}

function main(argv) {
  if (argv.includes('--verify')) return verify();
  if (argv.includes('--check')) return check();
  if (argv.includes('--apply')) return apply();
  return { ok: false, reason: 'specify --check | --apply | --verify' };
}

if (require.main === module) {
  const out = main(process.argv.slice(2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

module.exports = { mergeAutoMode, targetFor, check, apply, verify, BATON_AUTOMODE, MANAGED_DROPIN, USER_SETTINGS };
