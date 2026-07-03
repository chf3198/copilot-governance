'use strict';
// Refs #1291 — Manager-narrative advisory linter. Per Epic #1271 AC8.
// Marker-aware regex prevents false positives. #1211-style advisory→required graduation.

const { reconcileEpic, epicReadyToClose } = require('./epic-ac-reconcile');

const NARRATIVE_RE = /\bEpic\b\W*(\#\d+\W*)?(complete|done|shipped|finished)\b/i;

function detectNarrative(text) {
  const m = (text || '').match(NARRATIVE_RE);
  return m ? m[0] : null;
}

function lintComment({ commentBody, epicBody, hasMeasuringLabel = false }) {
  const match = detectNarrative(commentBody);
  if (!match) return { triggered: false };
  const reconciled = reconcileEpic({ body: epicBody, hasMeasuringLabel });
  const ready = epicReadyToClose(reconciled);
  if (ready) return { triggered: false, match };
  const unmet = reconciled.filter(r => r.truth_status !== 'READY_TO_CLOSE' && r.truth_status !== 'MEASURING' && !r.rescope_ref);
  return {
    triggered: true,
    match,
    unmet_acs: unmet.map(u => u.ac_id),
    advisory: `narrative-vs-ac-state: comment says "${match}" but reconciler shows unmet ACs: ${unmet.map(u => u.ac_id).join(', ')}. This is advisory until promotion gate (#1211 graduation, 4 weeks).`,
  };
}

async function run({ github, context, core }) {
  if (!context.payload.issue || !context.payload.comment) return;
  const labels = (context.payload.issue.labels || []).map(l => l.name || l);
  if (!labels.includes('type:epic')) return;
  const result = lintComment({
    commentBody: context.payload.comment.body,
    epicBody: context.payload.issue.body || '',
    hasMeasuringLabel: labels.includes('status:measuring'),
  });
  if (!result.triggered) return;
  await github.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.issue.number,
    body: `⚠️ **manager-narrative-lint (advisory)**\n\n${result.advisory}\n\n_Auto-posted by Epic #1271 AC8 advisory linter._`,
  });
  core.notice(`narrative-vs-ac-state: ${result.advisory}`);
}

module.exports = { detectNarrative, lintComment, run, NARRATIVE_RE };
