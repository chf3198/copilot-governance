#!/usr/bin/env node
'use strict';

// state-store-merge-reconciler (#2275, Phase-1 P1-1 of Epic 2261) — deterministic, evidence-gated
// post-merge state-store reconciler (the T2 fix from the Epic 2261 drift map).
//
// Problem it eliminates: after a PR merges to main, the local governance state-store keeps reporting
// `admin_ops.merge: missing` and `flags.code_touched: true` because nothing consumes the verifiable
// merge event and reconciles state. The Stop-hook then blocks turn-end despite the merge being a
// verifiable fact, and the only "fix" today is the agent hand-patching the flag — the exact soft-bypass
// pattern Epic 2261 exists to remove. This policy writes the flag; the agent never does — and only when
// the merge is VERIFIABLE. The policy never trusts the agent's word: there is no force/override path.
//
// Design (adapted to the flat governance-validator repo — see wiki/work-log/ticket-2275/manager-scope.md):
//   • reconcile(stores, evidence, opts)  — PURE. Verifies evidence, then produces reconciled copies of
//     ALL state-store variants (all-or-nothing). Refuses (no mutation) without verifiable MERGED evidence.
//   • reconcileFiles(paths, evidence, opts) — the fs-injected variant. Two-phase write with rollback so a
//     mid-write failure on one variant leaves ALL variants unmutated (atomic transaction, AC1/AC5c).
//   • buildAudit(...) — the structured `admin-ops-merge-reconciled` record (AC3).
//
// Hermetic: Node built-ins only; fs, clock, and audit sink are INJECTED so tests never touch real
// ~/.copilot state, never sleep, and never call `gh`/network. Live Python session-end/post-merge hook
// wiring is the out-of-repo untracked harness — documented as a follow-up shim, not fabricated here.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// The five Admin ops a verified merge proves complete, and the flag it clears.
const ADMIN_OPS = ['commit', 'push', 'pr_create', 'ci_green', 'merge'];
const PATTERN_ID = 'admin-ops-merge-reconciled';
const DEFAULT_AUDIT = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');

// ---------------------------------------------------------------------------
// AC4 — evidence gate. The ONLY thing that authorizes a mutation. Returns
// { verified:false, reason } for anything that is not a verifiable merge.
// ---------------------------------------------------------------------------
function verifyEvidence(evidence, opts = {}) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { verified: false, reason: 'no evidence object' };
  }
  // Case-sensitive: only GitHub's terminal MERGED state authorizes reconciliation. OPEN/CLOSED do not.
  if (evidence.state !== 'MERGED') {
    return { verified: false, reason: `merge not verifiable (state=${JSON.stringify(evidence.state)})` };
  }
  if (!Number.isInteger(evidence.pr) || evidence.pr <= 0) {
    return { verified: false, reason: 'evidence.pr must be a positive integer' };
  }
  if (typeof evidence.sha !== 'string' || !/^[0-9a-f]{7,40}$/i.test(evidence.sha)) {
    return { verified: false, reason: 'evidence.sha must be a 7-40 char hex commit sha' };
  }
  // If the caller pins a repo, the evidence must be for THAT repo (cross-repo merge cannot reconcile).
  if (opts.repo && evidence.repo && evidence.repo !== opts.repo) {
    return { verified: false, reason: `evidence repo ${evidence.repo} != expected ${opts.repo}` };
  }
  return { verified: true, reason: 'MERGED evidence verified' };
}

// ---------------------------------------------------------------------------
// Pure single-store transform. Clones (never mutates the input), sets every
// Admin op true and clears code_touched. Deterministic + idempotent (AC5d):
// re-running on an already-reconciled state yields an identical object.
// ---------------------------------------------------------------------------
function reconcileState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('state-store entry must be a JSON object');
  }
  const next = JSON.parse(JSON.stringify(state));
  next.admin_ops = { ...(next.admin_ops || {}) };
  for (const op of ADMIN_OPS) next.admin_ops[op] = true;
  next.flags = { ...(next.flags || {}) };
  next.flags.code_touched = false;
  return next;
}

// AC3 — structured audit record proving WHY the flags were cleared (verifiable evidence, not agent word).
function buildAudit(evidence, variantIds, now) {
  return {
    pattern_id: PATTERN_ID,
    pr: evidence.pr,
    sha: evidence.sha,
    repo: evidence.repo || null,
    variants: variantIds.slice(),
    ts: now,
  };
}

// ---------------------------------------------------------------------------
// AC1 — pure reconcile across ALL variants. All-or-nothing: if evidence is not
// verifiable, NOTHING is reconciled (refused); if any store is malformed, the
// whole batch refuses so variants never diverge.
//   stores: [{ id, state }]
//   returns { ok:true, reconciled:[{id,state}], audit } | { ok:false, refused:true, reason }
// ---------------------------------------------------------------------------
function reconcile(stores, evidence, opts = {}) {
  if (!Array.isArray(stores)) throw new TypeError('stores must be an array of { id, state }');
  const now = opts.now || new Date().toISOString();

  const ev = verifyEvidence(evidence, opts);
  if (!ev.verified) {
    // The policy refuses rather than trusting the agent — the gate stays blocked (AC4/AC5b).
    return { ok: false, refused: true, reason: ev.reason, reconciled: [], audit: null };
  }

  // Transform every variant first (pure). A single malformed variant aborts the whole batch so the
  // variants can never end up half-reconciled (atomicity at the value level).
  const reconciled = [];
  for (const s of stores) {
    if (!s || typeof s.id === 'undefined') throw new TypeError('each store needs an id');
    reconciled.push({ id: s.id, state: reconcileState(s.state) });
  }
  return { ok: true, refused: false, reason: ev.reason, reconciled, audit: buildAudit(evidence, reconciled.map(r => r.id), now) };
}

// ---------------------------------------------------------------------------
// AC2 — fs-injected variant with a two-phase, rollback-protected write so a
// mid-write failure leaves ALL variant files unmutated (AC5c). fs/emit/clock
// injected (opts.readFile/writeFile/emit/now) for hermetic tests.
//   paths: string[]  — state-store variant file paths (session-keyed, -nosession, mirrors)
// ---------------------------------------------------------------------------
function reconcileFiles(paths, evidence, opts = {}) {
  if (!Array.isArray(paths)) throw new TypeError('paths must be an array');
  const readFile = opts.readFile || (p => fs.readFileSync(p, 'utf8'));
  const writeFile = opts.writeFile || ((p, s) => fs.writeFileSync(p, s));
  const emit = opts.emit || (rec => fs.appendFileSync(opts.auditPath || DEFAULT_AUDIT, JSON.stringify(rec) + '\n'));
  const now = opts.now || new Date().toISOString();

  // Read + parse every variant, capturing the original raw bytes for rollback.
  const originals = new Map();
  const stores = [];
  for (const p of paths) {
    const raw = readFile(p);
    originals.set(p, raw);
    stores.push({ id: p, state: JSON.parse(raw) });
  }

  const result = reconcile(stores, evidence, { ...opts, now });
  if (!result.ok) return { ...result, written: [] }; // refused: nothing written, nothing emitted

  const byId = new Map(result.reconciled.map(r => [r.id, r.state]));
  const written = [];
  try {
    for (const p of paths) {
      writeFile(p, JSON.stringify(byId.get(p), null, 2) + '\n');
      written.push(p);
    }
  } catch (err) {
    // Rollback every file already written — the transaction is all-or-nothing.
    for (const p of written) {
      try { writeFile(p, originals.get(p)); } catch (_) { /* best-effort restore */ }
    }
    return { ok: false, refused: false, error: String(err && err.message || err), rolledBack: true, written: [] };
  }

  emit(result.audit);
  return { ok: true, refused: false, audit: result.audit, written };
}

module.exports = { reconcile, reconcileFiles, reconcileState, verifyEvidence, buildAudit, ADMIN_OPS, PATTERN_ID };

// ---------------------------------------------------------------------------
// CLI: `--self-check` runs a hermetic in-memory demonstration (no real files, no
// network) proving verify-then-write and refuse-without-evidence. Advisory-first:
// exits 0. Used as the workflow's advisory step.
// ---------------------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--self-check') || args.length === 0) {
    const blocked = { admin_ops: { merge: false }, flags: { code_touched: true } };
    const stores = [{ id: 'session-keyed', state: blocked }, { id: '-nosession', state: blocked }];
    const evidence = { state: 'MERGED', pr: 2275, sha: 'deadbeef', repo: 'chf3198/copilot-governance' };
    const now = '1970-01-01T00:00:00.000Z';

    const cleared = reconcile(stores, evidence, { now });
    const refused = reconcile(stores, { state: 'OPEN', pr: 2275, sha: 'deadbeef' }, { now });

    console.log('state-store-merge-reconciler self-check');
    console.log(`  verified MERGED  -> ok=${cleared.ok} merge=${cleared.reconciled[0].state.admin_ops.merge} code_touched=${cleared.reconciled[0].state.flags.code_touched}`);
    console.log(`  unverified OPEN  -> ok=${refused.ok} refused=${refused.refused} reason="${refused.reason}"`);
    if (!(cleared.ok && cleared.reconciled.every(r => r.state.admin_ops.merge === true && r.state.flags.code_touched === false))) {
      console.error('SELF-CHECK FAILED: verified evidence did not clear the gate'); process.exit(1);
    }
    if (refused.ok || !refused.refused) {
      console.error('SELF-CHECK FAILED: unverified evidence was not refused'); process.exit(1);
    }
    console.log('self-check OK (advisory; exits 0)');
    process.exit(0);
  }
  console.log('usage: state-store-merge-reconciler.js --self-check');
  process.exit(0);
}
