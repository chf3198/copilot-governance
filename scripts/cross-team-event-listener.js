'use strict';
// cross-team-event-listener (#1662) — pure helper consuming repository_dispatch + webhook events.
// Normalizes payload shapes into a single event-record. No I/O.

function normalize(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') return null;
  const eventName = rawEvent.event || rawEvent.event_type || rawEvent.action || 'unknown';
  const payload = rawEvent.payload || rawEvent.client_payload || rawEvent;
  return {
    eventName,
    source: detectSource(rawEvent),
    issueNumber: extractIssueNumber(payload),
    prNumber: extractPrNumber(payload),
    actor: payload.sender?.login || payload.actor || null,
    receivedAt: rawEvent.received_at || new Date().toISOString(),
  };
}

function detectSource(rawEvent) {
  if (rawEvent.event_type && rawEvent.client_payload) return 'repository_dispatch';
  if (rawEvent.inputs) return 'workflow_dispatch';
  if (rawEvent.delivery) return 'webhook';
  return 'unknown';
}

function extractIssueNumber(payload) {
  return payload.issue?.number || payload.pull_request?.number || null;
}

function extractPrNumber(payload) {
  return payload.pull_request?.number || null;
}

function isInteresting(event) {
  if (!event) return false;
  const NAMES = ['issues.labeled', 'issues.closed', 'pull_request.opened', 'pull_request.closed',
    'issue_comment.created', 'projects_v2_item.edited', 'cross-team-claim', 'cross-team-release'];
  return NAMES.includes(event.eventName);
}

module.exports = { normalize, detectSource, isInteresting, extractIssueNumber, extractPrNumber };
