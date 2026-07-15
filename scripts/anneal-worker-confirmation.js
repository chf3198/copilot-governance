'use strict';
// anneal-worker-confirmation — D-1436-02 (#1447).
// Adds a worker-confirmation branch between Tier-2 candidate detection
// and auto-file. When MEGINGJORD_ANNEAL_REQUIRE_CONFIRMATION=1 is set,
// candidates are written as "pending-confirmation" events to a queue
// file; workers later run with --apply-confirmed <proposal_id> to file
// the actual ticket. Default off → preserves existing nightly cron behavior.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ENV_FLAG = 'MEGINGJORD_ANNEAL_REQUIRE_CONFIRMATION';
const DEFAULT_QUEUE = path.join(os.homedir(), '.megingjord', 'anneal-pending.jsonl');

function isConfirmationRequired() {
  const value = process.env[ENV_FLAG];
  return value === '1' || value === 'true';
}

function loadQueue(queuePath) {
  const filePath = queuePath || DEFAULT_QUEUE;
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8').split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(entry => entry !== null);
}

function appendCandidate(candidate, meta, nowIso, queuePath) {
  const filePath = queuePath || DEFAULT_QUEUE;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const entry = {
    event: 'anneal.tier2.pending-confirmation',
    timestamp: nowIso,
    pattern_id: candidate.pattern_id,
    severity: candidate.severity,
    count: candidate.count,
    proposal_id: meta.proposal_id,
    dedupe_key: meta.dedupe_key,
    status: 'pending-confirmation',
  };
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
  return entry;
}

function findPending(proposalId, queuePath) {
  return loadQueue(queuePath).find(entry => entry.proposal_id === proposalId
    && entry.status === 'pending-confirmation') || null;
}

function findEntry(proposalId, queuePath) {
  return loadQueue(queuePath).find(entry => entry.proposal_id === proposalId) || null;
}

function markConfirmed(proposalId, queuePath) {
  const filePath = queuePath || DEFAULT_QUEUE;
  const events = loadQueue(filePath);
  let mutated = false;
  for (const entry of events) {
    if (entry.proposal_id === proposalId && entry.status === 'pending-confirmation') {
      entry.status = 'confirmed';
      entry.confirmed_at = new Date().toISOString();
      mutated = true;
    }
  }
  if (mutated) {
    fs.writeFileSync(filePath, events.map(line => JSON.stringify(line)).join('\n') + '\n');
  }
  return mutated;
}

function gateCandidate(candidate, meta, nowIso, opts = {}) {
  const required = opts.confirmationRequired !== undefined
    ? opts.confirmationRequired : isConfirmationRequired();
  if (!required) return { proceed: true, reason: 'confirmation-not-required' };
  const queuePath = opts.queuePath || DEFAULT_QUEUE;
  const existing = findEntry(meta.proposal_id, queuePath);
  if (!existing) {
    appendCandidate(candidate, meta, nowIso, queuePath);
    return { proceed: false, reason: 'queued-for-confirmation', proposal_id: meta.proposal_id };
  }
  if (existing.status === 'confirmed') {
    return { proceed: true, reason: 'worker-confirmed', proposal_id: meta.proposal_id };
  }
  return { proceed: false, reason: 'still-pending', proposal_id: meta.proposal_id };
}

module.exports = {
  isConfirmationRequired, loadQueue, appendCandidate, findPending, findEntry,
  markConfirmed, gateCandidate, ENV_FLAG, DEFAULT_QUEUE,
};
