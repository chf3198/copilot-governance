'use strict';
// phase0-closure-guard — blocks terminal close of a research-first Epic whose
// Phase-0 is green-complete but which has zero Phase-1 children
// (Epic #2678 / AC3, AC5, AC6). Design #2679 Component C.
//
// This is the hard backstop that makes the #2661 advisory-only bypass
// impossible: on an Epic close attempt, if the gate predicate reports
// missingPhase1Children, the guard posts a structured EPIC_PHASE_GATE_PAUSE /
// BLOCKER_NOTE, emits an incidents.jsonl event, and fails the workflow
// (non-zero exit). G6 escape hatch: PHASE0_GATE_BYPASS=1 downgrades to an
// advisory comment plus an audit line (never silent).

const { resolve } = require('./phase0-promotion-resolver.js');
const { buildIncident } = require('./megalint/phase0-promotion-gate.js');
const incidents = require('./incidents-store.js');

const MARKER = '<!-- phase0-closure-guard -->';

/** Pure: should this resolver result block an Epic close? */
function evaluateClosure(result) {
  const block = !!(result && result.applicable && result.complete && result.missingPhase1Children);
  return { block, reason: result && result.details };
}

/** Pure: build the BLOCKER_NOTE / EPIC_PHASE_GATE_PAUSE comment body. */
function buildBlockerNote(epicNumber, result) {
  return [
    MARKER, '',
    '## EPIC_PHASE_GATE_PAUSE', '',
    `**BLOCKER_NOTE** — Epic #${epicNumber} cannot close: Phase-0 is green-complete but it has **zero Phase-1 children**.`, '',
    `owner: Manager (role-manager)`,
    `unblock_condition: author at least one phase-gate:phase-1 child (or let phase1-auto-materialize seed one), then progress it through the baton`,
    `eta_or_review_time: next Manager pickup`, '',
    `detail: ${result.details}`,
    `pattern_id: ${result.pattern_id}`, '',
    '_Posted by phase0-closure-guard (Epic #2678). Set PHASE0_GATE_BYPASS=1 to downgrade to advisory with an audit trail._',
  ].join('\n');
}

async function upsertComment(github, owner, repo, epicNumber, body) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: epicNumber, per_page: 100,
  });
  const existing = comments.find((c) => (c.body || '').includes(MARKER));
  if (existing) {
    if (existing.body !== body) {
      await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    }
  } else {
    await github.rest.issues.createComment({ owner, repo, issue_number: epicNumber, body });
  }
}

async function run({ github, context, core }) {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const epicNumber = context.payload.issue.number;
  const result = await resolve({ github, owner, repo, epicNumber });
  const { block } = evaluateClosure(result);
  if (!block) {
    core.notice && core.notice(`phase0-closure-guard #${epicNumber}: ${result.details}`);
    return { blocked: false, result };
  }
  incidents.append(buildIncident(epicNumber, result.details, 'consultant'));
  const bypass = process.env.PHASE0_GATE_BYPASS === '1';
  const note = buildBlockerNote(epicNumber, result);
  await upsertComment(github, owner, repo, epicNumber, note).catch((e) => {
    core.warning && core.warning(`phase0-closure-guard comment failed: ${e.message}`);
  });
  if (bypass) {
    core.warning && core.warning(`phase0-closure-guard BYPASS used on #${epicNumber} (PHASE0_GATE_BYPASS=1) — advisory only`);
    return { blocked: false, bypass: true, result };
  }
  // Reopen the Epic so the blocked state is durable, then fail the run.
  await github.rest.issues.update({ owner, repo, issue_number: epicNumber, state: 'open' }).catch(() => {});
  core.setFailed(`Epic #${epicNumber} close blocked: Phase-0 green but no Phase-1 children (${result.pattern_id})`);
  return { blocked: true, result };
}

module.exports = { run, evaluateClosure, buildBlockerNote, MARKER };
