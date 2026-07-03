'use strict';
// Sensor data-fetcher (#1257) — gh API calls with timeout + graceful degradation.
// Per AC3 design: sensors degrade to null on fetch error so renormalization still works.

const { execSync } = require('node:child_process');
const { readFlag } = require('./oo');

const FETCH_TIMEOUT_MS = 10_000;
const WINDOW_DAYS = 7;

function safeJSON(cmd, fallback) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: FETCH_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out);
  } catch { return fallback; }
}

function fetchLLRuns() {
  return safeJSON(
    `gh api -X GET '/repos/chf3198/megingjord-harness/actions/workflows/label-lint.yml/runs?per_page=50' --jq '.workflow_runs[] | {conclusion, created_at}'`,
    []
  );
}

function fetchClosouts() {
  return safeJSON(
    `gh search issues --repo chf3198/megingjord-harness "CONSULTANT_CLOSEOUT" --limit 50 --json number,title --jq '[.[] | {number, title, body: ""}]'`,
    []
  );
}

function fetchPRReviews() {
  return safeJSON(
    `gh search prs --repo chf3198/megingjord-harness "goal-lens OR goal-priority" --limit 50 --json number --jq '[.[] | {body: "goal-lens"}]'`,
    []
  );
}

function fetchReopens() { return []; }

function fetchAll(violationCount) {
  return {
    violationCount,
    runs: fetchLLRuns(),
    closeouts: fetchClosouts(),
    reviews: fetchPRReviews(),
    reopens: fetchReopens(),
    flag: readFlag(),
  };
}

module.exports = { fetchAll, fetchLLRuns, fetchClosouts, fetchPRReviews, fetchReopens, FETCH_TIMEOUT_MS, WINDOW_DAYS };
