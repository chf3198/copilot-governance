'use strict';
// asserted-vs-observed-probes — the F6 contradiction detector (Epic #3425 P1-c, the #3424 class).
//
// A baton artifact ASSERTS a state; a cheap read-only probe can falsify it. Each probe pairs an
// assertion field with a comparator and, on mismatch, yields an F6 candidate tagged
// confidence: high|medium|low. Design contract (research AC-R4):
//   - cheap + bounded: per-probe budget (<=750ms), 3s total cap; over-budget => inconclusive.
//   - squash-aware: the worktree probe uses CONTENT-equivalence (git cherry), not commit-reachability,
//     so a squash-merged branch is treated as merged (never the #3424 false-positive).
//   - confidence-gated: only HIGH-confidence (pure-local) probes are ever blocking-eligible; medium
//     (network/gh) probes stay advisory permanently.
//   - fail-open + observable: a probe that cannot run yields `inconclusive` + a probe_error row, never
//     a false contradiction.
//   - redacted: probe outputs pass through log-redaction before any emission.

const { execFileSync } = require('child_process');
const { redactString } = require('./log-redaction');

const TOTAL_BUDGET_MS = 3000;
const DEFAULT_PROBE_BUDGET_MS = 750; // per-probe ceiling (network probes)
const LOCAL_PROBE_BUDGET_MS = 300;   // pure-local git probes (worktree list / cherry)
const EXISTS_BUDGET_MS = 200;        // git cat-file existence check
const F6_PATTERN_ID = 'asserted-vs-observed-contradiction';

// Run a git/gh command read-only within a budget. Returns { ok, out } or { ok:false, reason }.
function runCmd(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: opts.budgetMs || DEFAULT_PROBE_BUDGET_MS,
      stdio: ['ignore', 'pipe', 'ignore'], cwd: opts.cwd });
    return { ok: true, out: String(out) };
  } catch (err) {
    const reason = err && err.code === 'ETIMEDOUT' ? 'timeout'
      : (err && (err.code === 'ENOENT') ? 'tool-absent' : 'probe-error');
    return { ok: false, reason };
  }
}

// Read the artifact field value (line-anchored), or null when absent.
function field(body, name) {
  const match = String(body || '').match(new RegExp(`(?:^|\\n)[ \\t]*${name}[ \\t]*:[ \\t]*([^\\n]*)`, 'i'));
  return match ? match[1].trim() : null;
}

// ---- SQUASH-AWARE worktree probe (HIGH confidence, pure-local) ----
// A worktree branch is RESIDUAL only when it carries content not yet in main. `git cherry` marks a
// commit `-` when an equivalent change is already in main (the squash/cherry-pick case) and `+` when
// it is genuinely unmerged. Residual == any `+` line. This is the anti-#3424 core.
function worktreeResidualBranches(mainRef, opts = {}) {
  const list = runCmd('git', ['worktree', 'list', '--porcelain'], { budgetMs: LOCAL_PROBE_BUDGET_MS, cwd: opts.cwd });
  if (!list.ok) return { inconclusive: true, reason: list.reason };
  const branches = [...list.out.matchAll(/^branch\s+refs\/heads\/(.+)$/gim)].map((m) => m[1]);
  const residual = [];
  for (const branch of branches) {
    if (branch === 'main' || branch === mainRef) continue;
    const cherry = runCmd('git', ['cherry', mainRef, branch], { budgetMs: LOCAL_PROBE_BUDGET_MS, cwd: opts.cwd });
    if (!cherry.ok) continue; // a branch we cannot compare is not asserted as residual (fail-open)
    if (cherry.out.split('\n').some((line) => line.startsWith('+'))) residual.push(branch);
  }
  return { inconclusive: false, residual };
}

function worktreeProbe(body, ctx = {}) {
  const value = field(body, 'worktree_residual_risk');
  if (value === null || !/^(?:none|clean|this-ticket-clean)\b/i.test(value)) return null; // only probe a "clean" claim
  const mainRef = ctx.mainRef || 'origin/main';
  const result = worktreeResidualBranches(mainRef, ctx);
  if (result.inconclusive) {
    return { inconclusive: true, field: 'worktree_residual_risk', confidence: 'high', reason: result.reason };
  }
  if (result.residual.length === 0) return { contradiction: false, confidence: 'high' };
  return { contradiction: true, confidence: 'high', field: 'worktree_residual_risk',
    detail: `claims '${value}' but ${result.residual.length} worktree branch(es) carry unmerged content: ${result.residual.join(', ')}` };
}

// ---- existence probes (HIGH, pure-local) ----
function commitProbe(body, ctx = {}) {
  const value = field(body, 'commit');
  if (!value || /n\/?a/i.test(value)) return null;
  const sha = value.split(/\s/)[0];
  const res = runCmd('git', ['cat-file', '-e', `${sha}^{commit}`], { budgetMs: EXISTS_BUDGET_MS, cwd: ctx.cwd });
  if (res.ok) return { contradiction: false, confidence: 'high' };
  if (res.reason === 'timeout' || res.reason === 'tool-absent') {
    return { inconclusive: true, field: 'commit', confidence: 'high', reason: res.reason };
  }
  return { contradiction: true, confidence: 'high', field: 'commit', detail: `commit ${sha} does not exist` };
}

// ---- network probes (MEDIUM, advisory-only) ----
function prMergedProbe(body, ctx = {}) {
  const claim = /merge-evidence-deferred-final|prMerged|PR merged|merged/i.test(body || '');
  const prNum = (String(body || '').match(/PR\s*#?(\d{1,9})/i) || [])[1];
  if (!claim || !prNum) return null;
  const res = runCmd('gh', ['pr', 'view', prNum, '--json', 'state'], { budgetMs: DEFAULT_PROBE_BUDGET_MS, cwd: ctx.cwd });
  if (!res.ok) return { inconclusive: true, field: 'pr', confidence: 'medium', reason: res.reason };
  return { contradiction: false, confidence: 'medium' }; // medium never blocks; presence-only check here
}

// ---- pure-text probes (HIGH) ----
function acsPassProbe(body) {
  const text = String(body || '');
  if (!/all\s+acs?\s+(?:verified\s+)?pass/i.test(text)) return null;
  const ticked = (text.match(/- \[x\]/gi) || []).length;
  const unticked = (text.match(/- \[ \]/g) || []).length;
  if (unticked > 0 && ticked > 0) {
    return { contradiction: true, confidence: 'high', field: 'acs',
      detail: `claims all ACs pass but ${unticked} AC checkbox(es) are unticked` };
  }
  return { contradiction: false, confidence: 'high' };
}

const PROBES = [worktreeProbe, commitProbe, prMergedProbe, acsPassProbe];

// Run all applicable probes against an artifact body. Returns { candidates, probeErrors } where
// candidates are F6 contradiction candidates and probeErrors are inconclusive rows (for incidents.jsonl).
function runProbes(body, ctx = {}) {
  const started = Date.now();
  const candidates = [];
  const probeErrors = [];
  for (const probe of PROBES) {
    if (Date.now() - started > (ctx.totalBudgetMs || TOTAL_BUDGET_MS)) break; // total cap
    let result;
    try { result = probe(body, ctx); } catch { result = { inconclusive: true, reason: 'probe-error' }; }
    if (!result) continue;
    if (result.inconclusive) {
      probeErrors.push({ pattern_id: 'probe_error', field: result.field || null,
        reason: result.reason || 'unknown', severity: 'low' });
      continue;
    }
    if (result.contradiction) {
      const redacted = redactString(result.detail || '');
      candidates.push({ class: 'F6', pattern_id: F6_PATTERN_ID, severity: 'high',
        confidence: result.confidence, field: result.field,
        detail: typeof redacted === 'string' ? redacted : redacted.text,
        blocking_eligible: result.confidence === 'high' });
    }
  }
  return { candidates, probeErrors };
}

module.exports = {
  runProbes, worktreeProbe, worktreeResidualBranches, commitProbe, prMergedProbe, acsPassProbe,
  field, PROBES, F6_PATTERN_ID, TOTAL_BUDGET_MS,
};
