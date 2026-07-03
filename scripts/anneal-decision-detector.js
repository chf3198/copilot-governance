#!/usr/bin/env node
// anneal-decision-detector (#1855) — scans transcript/text for flaw-recognition
// markers + cross-checks against recorded decisions (incidents.jsonl).
// Detects the meta-violation: "I recognized a flaw but did not record a decision."
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const INCIDENTS_FILE = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');

// Recognition markers — phrases that indicate the agent noticed a flaw.
const RECOGNITION_MARKERS = [
  /\bif you want\b/i, /\bshould\s+(?:i|we)\s+(?:file|create|open)\b/i,
  /\bperhaps\s+(?:we|i)\s+should\s+file\b/i, /\bworth\s+filing\b/i,
  /\bcould\s+be\s+(?:filed|tracked)\b/i,
  /\bthis\s+is\s+a\s+recurrence\b/i, /\btrap\s+class\b/i,
  /\b(?:violation|drift|regression)\b/i, /\b(?:flaw|defect|gap)\s+(?:in|with)\b/i,
];

// Decision markers — phrases that indicate a recorded decision per the contract.
const DECISION_MARKERS = [
  /decision\s*[:=]\s*file-ticket/i,
  /decision\s*[:=]\s*log-incident-only/i,
  /decision\s*[:=]\s*memory-note-only/i,
  /decision\s*[:=]\s*no-action-justified/i,
];

function findMarkers(text, patterns) {
  const lines = String(text || '').split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    for (const re of patterns) {
      if (re.test(lines[i])) { hits.push({ line: i + 1, snippet: lines[i].trim().slice(0, 200) }); break; }
    }
  }
  return hits;
}

function readDecisionsRecent(file = INCIDENTS_FILE, windowMs = 30 * 60 * 1000) {
  if (!fs.existsSync(file)) return [];
  const cutoff = Date.now() - windowMs;
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      const ts = typeof event.ts === 'number' ? event.ts : Date.parse(event.ts || '');
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      if (event.decision || /flaw-recognition|anneal-decision/.test(event.event || '')) {
        out.push(event);
      }
    } catch { /* skip malformed */ }
  }
  return out;
}

function evaluate(text, opts = {}) {
  const recognitions = findMarkers(text, RECOGNITION_MARKERS);
  const inlineDecisions = findMarkers(text, DECISION_MARKERS);
  const recordedDecisions = opts.skipRecordedScan ? []
    : readDecisionsRecent(opts.incidentsFile, opts.windowMs);
  const totalDecisions = inlineDecisions.length + recordedDecisions.length;
  const unmatched = Math.max(0, recognitions.length - totalDecisions);
  return {
    ok: unmatched === 0,
    recognitions_count: recognitions.length,
    inline_decisions: inlineDecisions.length,
    recorded_decisions: recordedDecisions.length,
    unmatched_recognitions: unmatched,
    recognition_samples: recognitions.slice(0, 5),
  };
}

module.exports = { evaluate, findMarkers, readDecisionsRecent,
  RECOGNITION_MARKERS, DECISION_MARKERS, INCIDENTS_FILE };
