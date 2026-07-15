'use strict';
// cross-team-auto-apply — #1590 (AC3 follow-on of #1334). Pure decision helper
// for the issue_comment-triggered workflow that auto-applies the
// consultant:cross-team-needed label when a Manager posts an
// EPIC_CLOSEOUT-pending comment containing the canonical "cross-team
// Consultant required" trigger phrase. Workflow YAML handles GitHub API calls.

const MANAGER_RE = /Role:\s*manager\b/i;
const MANAGER_HEADER_RE = /(^|\n)\s*(?:\*\*|##\s+)?MANAGER_HANDOFF\b/;
const CLOSEOUT_RE = /CONSULTANT_EPIC_CLOSEOUT/;
const TRIGGER_RE = /cross-team Consultant required/i;
const TARGET_LABEL = 'consultant:cross-team-needed';
const SUPPRESS_LABELS = ['consultant:cross-team-needed', 'consultant:cross-team-in-progress'];

function isManagerComment(body) {
  if (!body) return false;
  return MANAGER_RE.test(body) || MANAGER_HEADER_RE.test(body);
}

function isCrossTeamCloseoutRequest(commentBody) {
  if (!commentBody) return false;
  return isManagerComment(commentBody)
    && CLOSEOUT_RE.test(commentBody)
    && TRIGGER_RE.test(commentBody);
}

function isEligibleEpic(labels) {
  const set = labels || [];
  if (!set.includes('type:epic')) return false;
  if (SUPPRESS_LABELS.some(l => set.includes(l))) return false;
  return true;
}

function decideApply(input) {
  const commentBody = (input && input.commentBody) || '';
  const labels = (input && input.labels) || [];
  if (!isCrossTeamCloseoutRequest(commentBody)) {
    return { apply: false, reason: 'comment-not-manager-cross-team-request' };
  }
  if (!isEligibleEpic(labels)) {
    return { apply: false, reason: 'issue-not-eligible-epic' };
  }
  return { apply: true, label: TARGET_LABEL, reason: 'manager-request-matched' };
}

module.exports = {
  isManagerComment, isCrossTeamCloseoutRequest, isEligibleEpic, decideApply,
  TARGET_LABEL, SUPPRESS_LABELS,
};
