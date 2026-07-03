'use strict';
// epic-dormant-review — Rule E5: post EPIC_REVIEW reminder for dormant Epics
// overdue for their 90-day review. Consumed by epic-dormant-review.yml (#2920).

const DEFAULT_REVIEW_DAYS = Number(process.env.EPIC_DORMANT_AFTER_DAYS || 90);
const DAY_MS = 86_400_000;
const REVIEW_RE = /(^|\n)\s*EPIC_REVIEW[\s:]/i;

function daysSince(isoOrMs, nowMs) {
  if (!isoOrMs) return Infinity;
  return Math.floor(((nowMs || Date.now()) - Date.parse(isoOrMs)) / DAY_MS);
}

function hasRecentReview(comments, days) {
  const window = days || DEFAULT_REVIEW_DAYS;
  const cutoff = Date.now() - window * DAY_MS;
  return (comments || []).some(c =>
    Date.parse(c.created_at || 0) >= cutoff && REVIEW_RE.test(c.body || ''),
  );
}

function needsDormantReview({ dormantSinceIso, comments, reviewAfterDays } = {}) {
  const threshold = reviewAfterDays || DEFAULT_REVIEW_DAYS;
  if (!dormantSinceIso) return { needed: false, reason: 'dormant-since-unknown' };
  const age = daysSince(dormantSinceIso);
  if (age < threshold) return { needed: false, reason: 'not-overdue', ageDays: age };
  if (hasRecentReview(comments, threshold)) {
    return { needed: false, reason: 'recent-review-exists', ageDays: age };
  }
  return { needed: true, reason: 'overdue-no-review', ageDays: age };
}

function reviewReminderComment(epicNumber, ageDays, thresholdDays) {
  return [
    '## EPIC_REVIEW Reminder',
    '',
    `@role:manager — Epic #${epicNumber} has been \`status:dormant\` for **${ageDays} days**`,
    `(threshold: ${thresholdDays} days, Rule E5).`,
    '',
    'Please post an `EPIC_REVIEW` comment with one of the following verdicts:',
    '- `stay-dormant` — work intentionally paused; next check-in date noted',
    '- `reclassify` — Epic should resume (`status:in-progress`) or move to `deferred`',
    '- `cancel` — goal no longer applies; begin cancel flow',
    '',
    '_Posted by epic-dormant-review workflow. Refs #2920._',
  ].join('\n');
}

function findDormantSince(comments, labeledAt) {
  if (labeledAt) return labeledAt;
  const pause = (comments || [])
    .filter(c => (c.body || '').includes('EPIC_AUTO_PAUSE'))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return pause ? pause.created_at : null;
}

async function processEpic(epic, { github, owner, repo, threshold, dryRun, core }) {
  const labels = (epic.labels || []).map(l => (typeof l === 'string' ? l : l.name));
  if (!labels.includes('status:dormant')) return;
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: epic.number, per_page: 100,
  });
  const dormantSince = findDormantSince(comments, null);
  const decision = needsDormantReview({ dormantSinceIso: dormantSince, comments, reviewAfterDays: threshold });
  core.info(`Epic #${epic.number}: ${decision.reason} (age=${decision.ageDays ?? '?'}d)`);
  if (decision.needed && !dryRun) {
    await github.rest.issues.createComment({
      owner, repo, issue_number: epic.number,
      body: reviewReminderComment(epic.number, decision.ageDays, threshold),
    });
  }
}

async function run({ github, context, core }) {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const threshold = Number(process.env.EPIC_DORMANT_AFTER_DAYS || DEFAULT_REVIEW_DAYS);
  const dryRun = context.payload.inputs?.dry_run === 'true';
  const targetNum = context.payload.inputs?.epic_number
    ? Number(context.payload.inputs.epic_number) : null;
  const epics = targetNum
    ? [(await github.rest.issues.get({ owner, repo, issue_number: targetNum })).data]
    : await github.paginate(github.rest.issues.listForRepo, {
        owner, repo, labels: 'type:epic,status:dormant', state: 'open', per_page: 100,
      });
  for (const epic of epics) {
    await processEpic(epic, { github, owner, repo, threshold, dryRun, core });
  }
}

module.exports = {
  DEFAULT_REVIEW_DAYS, REVIEW_RE,
  daysSince, hasRecentReview, needsDormantReview,
  reviewReminderComment, findDormantSince, processEpic, run,
};
