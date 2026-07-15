#!/usr/bin/env node
'use strict';
/*
 * baseline-drift-sentinel (#3819) — Mode A (DETECT) of the ratified baseline-drift reconciler
 * (design receipt 3355d17ac42b51ae; ticket-3801 AC5 / ticket-3818 closeout child).
 *
 * INVERTED-GITOPS framing: desired state = the committed baseline (origin/main); observed state = the
 * canonical checkout's working tree. Because the drift is LIVE security-guard logic, legitimate
 * divergence is captured (promoted) upward — never reverted. This module only DETECTS + reports drift
 * so it "never re-accumulates silently" (ticket-3801 AC5). It is ADVISORY-FIRST: it enforces nothing and
 * never blocks. Modes B (capture) and C (cutover) are separate later work.
 *
 * Level-triggered + idempotent (K8s reconciler pattern): each run recomputes drift from current state;
 * running it twice has the same effect as once. Pure `classifyDrift` is unit-tested in isolation; the
 * git-backed `collect`/`report` are best-effort and CI-safe (a clean tree => 0 drift => exit 0).
 */

const { execFileSync } = require('child_process');

// Expected-mutation allowlist — ephemeral runtime files that legitimately churn every session and must
// NOT be counted as actionable drift (GitOps "ignore expected mutations" / helm-diff annotation-ignore;
// parity with hooks/scripts/session_baseline.is_expected_mutation, ticket-3820).
const EXPECTED_MUTATION_PREFIXES = ['.megingjord/', '.copilot/', '.claude/'];
const EXPECTED_MUTATION_SUBSTRINGS = [
  'session.id', 'session_baseline', 'governance_state', 'state_store',
  'runtime_session', 'tool_activity', 'incidents.log', 'friction-events',
];

// Default advisory threshold: above this many ACTIONABLE drifted paths, the sentinel flags
// `beyondThreshold` (advisory only). Conservative to start; tighten during the soak (GitOps playbook).
const DEFAULT_THRESHOLD = 25;

function isExpectedMutation(p) {
  const s = String(p);
  if (EXPECTED_MUTATION_PREFIXES.some((pre) => s.startsWith(pre))) return true;
  return EXPECTED_MUTATION_SUBSTRINGS.some((sub) => s.includes(sub));
}

/**
 * Pure classifier — the unit-tested core. Buckets porcelain paths into ignored (expected-mutation) vs
 * actionable. Deterministic; no I/O. `opts.isExpectedMutation` is injectable for tests.
 * @param {string[]} paths  working-tree paths (from `git status --porcelain -uall | cut -c4-`)
 * @param {{isExpectedMutation?: (p:string)=>boolean}} [opts]
 * @returns {{total:number, ignored:string[], actionable:string[]}}
 */
function classifyDrift(paths, opts) {
  const isIgnored = (opts && opts.isExpectedMutation) || isExpectedMutation;
  const clean = (paths || []).map((p) => String(p).trim()).filter(Boolean);
  const ignored = [];
  const actionable = [];
  for (const p of clean) (isIgnored(p) ? ignored : actionable).push(p);
  return { total: clean.length, ignored, actionable };
}

/**
 * Best-effort collection of working-tree drift paths at `root`. Returns [] on a clean tree OR any
 * failure (not-a-git-repo, git missing) — so CI (clean checkout) and hermetic runs never error.
 * @returns {string[]}
 */
function collect(root) {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '-uall'], {
      cwd: root || process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').map((l) => l.slice(3)).filter((p) => p && p.trim());
  } catch (_) {
    return [];
  }
}

/**
 * Advisory report — the level-triggered detect result. NEVER throws; NEVER blocks.
 * @returns {{driftTotal:number, ignored:number, actionable:number, threshold:number,
 *            beyondThreshold:boolean, sample:string[]}}
 */
function report(root, opts) {
  const threshold = (opts && Number.isFinite(opts.threshold)) ? opts.threshold : DEFAULT_THRESHOLD;
  const { total, ignored, actionable } = classifyDrift(collect(root), opts);
  return {
    driftTotal: total,
    ignored: ignored.length,
    actionable: actionable.length,
    threshold,
    beyondThreshold: actionable.length > threshold,
    sample: actionable.slice(0, 10),
  };
}

/* --------------------------------- self-test (hard gate) --------------------------------- */
function selfTest() {
  const assert = (cond, msg) => { if (!cond) { throw new Error('SELFTEST FAIL: ' + msg); } };

  // classifyDrift: ignored vs actionable partition
  const c = classifyDrift([
    '.megingjord/session.id', 'hooks/scripts/governance_state.json',
    'scripts/real-a.js', 'scripts/real-b.py', '.copilot/x', '  ', 'docs/z.md',
  ]);
  assert(c.total === 6, 'blank line dropped, total=6');
  assert(c.actionable.length === 3, 'three actionable (real-a, real-b, z.md)');
  assert(c.ignored.length === 3, 'three ignored (session.id, governance_state, .copilot/x)');

  // empty => zero drift
  const e = classifyDrift([]);
  assert(e.total === 0 && e.actionable.length === 0, 'empty tree => 0 drift');

  // isExpectedMutation
  assert(isExpectedMutation('.claude/anything'), '.claude/ ignored');
  assert(isExpectedMutation('x/state_store.json'), 'state_store ignored');
  assert(!isExpectedMutation('scripts/validator.js'), 'real script not ignored');

  // injectable classifier
  const inj = classifyDrift(['a', 'b'], { isExpectedMutation: (p) => p === 'a' });
  assert(inj.ignored.length === 1 && inj.actionable[0] === 'b', 'injectable classifier honored');

  // report on a synthetic clean root is CI-safe (0 drift, not beyond threshold)
  const r = report(process.cwd(), { threshold: 100000 });
  assert(r.beyondThreshold === false, 'huge threshold never beyond');
  assert(typeof r.driftTotal === 'number', 'report shape');

  return true;
}

module.exports = {
  classifyDrift, isExpectedMutation, collect, report, selfTest,
  DEFAULT_THRESHOLD, EXPECTED_MUTATION_PREFIXES, EXPECTED_MUTATION_SUBSTRINGS,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    try { selfTest(); console.log('baseline-drift-sentinel self-test: PASS'); process.exit(0); }
    catch (err) { console.error(String(err && err.message || err)); process.exit(1); }
  }
  // Default: advisory self-report. ALWAYS exit 0 (advisory-first).
  const r = report(process.cwd(), {});
  console.log(
    `Baseline-drift sentinel (advisory, non-blocking): drift=${r.driftTotal} ` +
    `(actionable=${r.actionable}, ignored=${r.ignored}); threshold=${r.threshold}; ` +
    `beyondThreshold=${r.beyondThreshold}` + (r.actionable ? ` — capture via baseline-drift reconciler Mode B.` : ' — clean.'),
  );
  if (r.beyondThreshold) {
    console.log(`  ~ ${r.actionable} actionable drifted paths exceed threshold ${r.threshold} (advisory-first ticket-3801 AC5; promote-to-blocking after soak). sample: ${r.sample.join(', ')}`);
  }
  process.exit(0);
}
