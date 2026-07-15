'use strict';
// baton-back-ledger.js (Epic #3251, Phase-1 child #3259): a metadata-ONLY,
// redaction-wrapped observability writer for baton-back routing events.
//
// Two deliberate design choices resolve prior failure modes:
//  1. PER-TICKET file (`governance/baton-back-events/<ticket>.jsonl`) — NOT the
//     monolithic hash-chained `cross-family-consensus.jsonl`, whose single-file
//     concurrent-merge fragility is #3573 (merge-driver fix #3658 was cancelled).
//  2. METADATA-ONLY + `log-redaction.wrapWrite` — the finding's free-text lesson
//     never enters the ledger (it lives on the authoritative issue timeline), so
//     no secret/PII can leak through this surface (G4, prevent-at-instrumentation).
const fs = require('fs');
const path = require('path');
const { wrapWrite } = require('./log-redaction');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'governance', 'baton-back-events');

// Project a baton-back marker to a metadata-only event. Free-text fields
// (`lesson`, any summary) are intentionally DROPPED — only routing metadata.
function toEvent(marker = {}, ticket, extra = {}) {
  marker = marker || {};
  return {
    ts: extra.ts || new Date().toISOString(),
    version: 3,
    service: 'baton-back',
    env: process.env.NODE_ENV || 'local',
    event: marker.open === false ? 'baton-back-cleared' : 'baton-back-open',
    ticket: Number(ticket) || null,
    detector: marker.detector || null,
    remediator: marker.remediator || null,
    impact: marker.impact || null,
    cycle: marker.cycle || 1,
    finding_ref: marker.finding_ref || null,
    review: marker.review || null,
    open: marker.open !== false,
  };
}

function ledgerPath(ticket, dir = DEFAULT_DIR) {
  return path.join(dir, `${Number(ticket) || 'unknown'}.jsonl`);
}

// Append one metadata-only event for a ticket. The write goes through
// `wrapWrite` (redaction) then a per-ticket append. Injectable `writeFn`/`dir`
// for tests. Best-effort: an IO failure must never block the baton (returns false).
function appendEvent(ticket, marker, opts = {}) {
  const dir = opts.dir || DEFAULT_DIR;
  const event = toEvent(marker, ticket, { ts: opts.ts });
  const rawWrite = opts.writeFn || ((redacted) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(ledgerPath(ticket, dir), JSON.stringify(redacted) + '\n');
  });
  const write = wrapWrite(rawWrite);
  try { write(event); return true; }
  catch { return false; }
}

// Read back a ticket's events (mirror; for audit/observability, never authority).
function readEvents(ticket, dir = DEFAULT_DIR) {
  const file = ledgerPath(ticket, dir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

module.exports = { toEvent, ledgerPath, appendEvent, readEvents, DEFAULT_DIR };
