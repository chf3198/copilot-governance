'use strict';

// governance-drift-propose (#2990, Epic #2981 Phase-1) — PROPOSE-ONLY review queue
// for the AMBIGUOUS drift classes that must NOT be auto-fixed:
//   D1  fully unlabeled issue (needs type inference)
//   D2  status:in-progress with no role:* baton holder
//   D6  dormant/deferred Epic past its EPIC_REVIEW window
//   D7  stalled coordinator:cross-team-needs-hand-off
// These need a Manager/Consultant verdict, so this module DELIBERATELY has no
// gh-write path. It only emits a JSON queue (to logs/, gitignored) describing
// each proposal — class, rationale, suggested action, who must adjudicate, and
// the lane any language-judgment residue may use (free/fleet only — never
// premium). Zero LLM tokens: detection is deterministic; the module itself
// makes no model calls. Auto-fix-safe classes (D3/D4/D5/D8) belong to #2989.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const QUEUE_FILE = path.join(ROOT, 'logs', 'governance-drift-propose-queue.json');

// Disjoint from #2989's SAFE_CLASSES — these are the classes that require a verdict.
const PROPOSE_META = {
  D1: {
    rationale: 'Issue carries no type/status/priority label.',
    suggested_action: 'Infer and apply type + status + priority labels.',
    verdict_required: 'manager',
    inference_lane: 'fleet', // type inference needs language judgment
  },
  D2: {
    rationale: 'status:in-progress with no role:* baton holder.',
    suggested_action: 'Assign the active baton role (role:collaborator default) or revert status.',
    verdict_required: 'manager',
    inference_lane: 'free',
  },
  D6: {
    rationale: 'Dormant/deferred Epic with no EPIC_REVIEW marker past its review window.',
    suggested_action: 'Manager posts an EPIC_REVIEW verdict (stay-dormant | reclassify | cancel).',
    verdict_required: 'manager',
    inference_lane: 'free',
  },
  D7: {
    rationale: 'coordinator:cross-team-needs-hand-off present and possibly stalled.',
    suggested_action: 'Re-route the hand-off or clear the orphan coordinator label.',
    verdict_required: 'consultant',
    inference_lane: 'free',
  },
};

const PROPOSE_CLASSES = Object.keys(PROPOSE_META);
const ALLOWED_LANES = new Set(['free', 'fleet']); // premium is never permitted for residue

// Pure: build the propose-only queue from the open-issue corpus. Never mutates.
function buildProposeQueue(issues = [], classify) {
  if (typeof classify !== 'function') throw new Error('buildProposeQueue: classify function is required');
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  const proposals = [];
  for (const issue of issues) {
    const result = classify(issue, byNumber);
    // Enforce the classify contract (fail-closed): a non-array return would
    // otherwise throw on .filter or silently mis-process (#2990 review finding).
    if (!Array.isArray(result)) {
      throw new Error(`buildProposeQueue: classify(#${issue.number}) must return an array of class strings`);
    }
    const detected = result.filter((driftClass) => PROPOSE_CLASSES.includes(driftClass));
    for (const driftClass of detected) {
      const meta = PROPOSE_META[driftClass];
      if (!ALLOWED_LANES.has(meta.inference_lane)) {
        throw new Error(`governance-drift-propose: class ${driftClass} routes to forbidden lane '${meta.inference_lane}'`);
      }
      proposals.push({ ticket: issue.number, class: driftClass, mutates: false, ...meta });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    mode: 'propose',
    route: 'deterministic',
    premiumLaneProhibited: true,
    total: proposals.length,
    classes: PROPOSE_CLASSES,
    proposals,
  };
}

function writeQueue(queue, file = QUEUE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(queue, null, 2));
  return file;
}

module.exports = {
  buildProposeQueue,
  writeQueue,
  PROPOSE_CLASSES,
  PROPOSE_META,
  ALLOWED_LANES,
  QUEUE_FILE,
};
