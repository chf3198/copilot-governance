#!/usr/bin/env node
'use strict';
// Baton-progression continuity guardrail (#2957).
//
// Enforces that the baton artifacts present on a linked issue form a CONTIGUOUS,
// monotonically time-ordered prefix of:
//   MANAGER_HANDOFF -> COLLABORATOR_HANDOFF -> ADMIN_HANDOFF -> CONSULTANT_CLOSEOUT
//
// This complements pre-pr-gate's checkBatonCompleteness (#1896), which only checks
// artifact PRESENCE. The #2940 incident showed Copilot Auto-mode "proceeding without
// explicit baton artifact continuity at each step" — i.e. a present artifact set that
// skips a role or posts artifacts out of order. That is what this module denies.
//
// Route-invariance is the core anti-drift property (#2957: "Auto model selection must
// not reduce governance discipline"). No model/route/auto-mode signal is read by the
// decision functions, so Copilot Auto-mode receives IDENTICAL enforcement to frontier
// routing. The evaluate() wrapper makes that invariant explicit and testable.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const STAGE_ORDER = [
  'MANAGER_HANDOFF',
  'COLLABORATOR_HANDOFF',
  'ADMIN_HANDOFF',
  'CONSULTANT_CLOSEOUT',
];
const INCIDENT_PATTERN_ID = 'auto-mode-baton-progression-gap';
const SUMMARY_MAX_LEN = 200; // _summary cap for the schema-v3 incident record

// Latest createdAt (epoch ms) per baton stage present in the comment list.
// Tolerant of malformed input: non-array, null comments, non-string bodies, and
// unparseable timestamps are skipped rather than thrown (G6 resilience).
function latestTimestampsByStage(comments) {
  const timestamps = {};
  const list = Array.isArray(comments) ? comments : [];
  for (const comment of list) {
    const body = comment && typeof comment.body === 'string' ? comment.body : '';
    if (!body) continue;
    const createdAt = comment && comment.createdAt ? Date.parse(comment.createdAt) : NaN;
    if (!Number.isFinite(createdAt)) continue;
    for (const stage of STAGE_ORDER) {
      if (body.includes(stage)) {
        if (timestamps[stage] === undefined || createdAt > timestamps[stage]) {
          timestamps[stage] = createdAt;
        }
      }
    }
  }
  return timestamps;
}

// Returns a violation { rule, detail } when the present artifacts are NOT a
// contiguous, time-ordered prefix of STAGE_ORDER; otherwise null. Model-agnostic.
function checkBatonProgression(comments) {
  const timestamps = latestTimestampsByStage(comments);
  const present = STAGE_ORDER.map((stage) => timestamps[stage] !== undefined);
  const lastPresentIndex = present.lastIndexOf(true);
  if (lastPresentIndex < 0) return null; // no artifacts yet — nothing to order

  // Contiguity: every earlier stage must be present (no skipped step).
  for (let i = 0; i < lastPresentIndex; i++) {
    if (!present[i]) {
      return {
        rule: 'baton-progression-gap',
        detail:
          `${STAGE_ORDER[lastPresentIndex]} present but earlier ${STAGE_ORDER[i]} is ` +
          'missing — baton continuity skipped a step before a privileged action.',
      };
    }
  }
  // Monotonic ordering: no present stage may predate the stage before it.
  for (let i = 1; i <= lastPresentIndex; i++) {
    if (timestamps[STAGE_ORDER[i]] < timestamps[STAGE_ORDER[i - 1]]) {
      return {
        rule: 'baton-progression-out-of-order',
        detail:
          `${STAGE_ORDER[i]} is timestamped before ${STAGE_ORDER[i - 1]} — baton ` +
          'artifacts were posted out of role order.',
      };
    }
  }
  return null;
}

// Route-invariant evaluation entrypoint. `context` may carry a model/route/auto-mode
// hint from the runtime; it is intentionally IGNORED so governance discipline is
// identical regardless of routing. Do not branch on context here — that is the bug
// class #2957 exists to prevent.
function evaluate(comments, context) {
  void context; // deliberately unused — see route-invariance contract above
  return checkBatonProgression(comments);
}

// Append a Tier-2 incident capturing the progression gap for the anneal detector.
// Emission failure is swallowed (returns false) — observability must never block a
// gate (G6/G8).
function emitProgressionIncident(violation, opts = {}) {
  const file =
    opts.incidentsPath || path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
  const record = {
    ts: opts.now ? new Date(opts.now).toISOString() : new Date().toISOString(),
    version: 3,
    service: 'baton-progression-parity',
    env: 'local',
    event: 'kill-switch-trip',
    pattern_id: INCIDENT_PATTERN_ID,
    rule: violation.rule,
    _summary: String(violation.detail || '').slice(0, SUMMARY_MAX_LEN),
  };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  checkBatonProgression,
  evaluate,
  latestTimestampsByStage,
  emitProgressionIncident,
  STAGE_ORDER,
  INCIDENT_PATTERN_ID,
};
