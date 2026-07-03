#!/usr/bin/env node
'use strict';
// open-pr-closeout-check (#3028, C3 of Epic #3026) — pre-push closeout-presence gate.
//
// Reuses the shared `scanOpenPRs` detector shipped in #3025 (open-pr-closeout-scan.js)
// — this file is ONLY the pre-push gating policy around it (block-mode + override marker),
// a distinct surface from #3025's session-end advisory. No detection logic is duplicated.
//
// Rollout policy (advisory-first):
//   - default: warn + exit 0 (never blocks a push).
//   - CLOSEOUT_CHECK_BLOCK=1: a finding exits 1 (blocking).
//   - `[skip-closeout-check]` in the latest commit subject: skip entirely (exit 0).

const { execFileSync } = require('node:child_process');
const { scanOpenPRs } = require('./open-pr-closeout-scan.js');

const OVERRIDE_MARKER = '[skip-closeout-check]';

/** Latest commit subject (best-effort; empty string if git is unavailable). */
function latestCommitSubject() {
  try { return execFileSync('git', ['log', '-1', '--pretty=%s'], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

/** gh JSON helper — returns null on any failure so the gate degrades gracefully (G6). */
function ghJson(args) {
  try { return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }) || 'null'); }
  catch { return null; }
}

const cliListOpenPRs = async () => ghJson(['pr', 'list', '--state', 'open', '--json', 'number,body']) || [];
const cliGetIssue = async (issueNumber) =>
  ghJson(['issue', 'view', String(issueNumber), '--json', 'comments']) || { comments: [] };

/**
 * Decide the gate outcome from findings + policy. Pure — unit-testable without git/gh.
 * @returns {{ exitCode: number, blocked: boolean, message: string }}
 */
function decide(findings, { blockMode, overridden }) {
  if (overridden) {
    return { exitCode: 0, blocked: false, message: `[closeout-check] skipped via ${OVERRIDE_MARKER} override.` };
  }
  if (!findings.length) {
    return { exitCode: 0, blocked: false,
      message: '[closeout-check] OK — no open PR has a linked issue missing CONSULTANT_CLOSEOUT.' };
  }
  const lines = findings.map((f) => `  - PR #${f.pr} -> issue #${f.issue}: missing CONSULTANT_CLOSEOUT.`);
  const head = blockMode
    ? `[closeout-check] BLOCKED — ${findings.length} open PR(s) missing CONSULTANT_CLOSEOUT (CLOSEOUT_CHECK_BLOCK=1):`
    : `[closeout-check] WARNING — ${findings.length} open PR(s) missing CONSULTANT_CLOSEOUT (advisory; set CLOSEOUT_CHECK_BLOCK=1 to enforce, or ${OVERRIDE_MARKER} to skip):`;
  return { exitCode: blockMode ? 1 : 0, blocked: blockMode, message: [head, ...lines].join('\n') };
}

async function run(opts = {}) {
  const blockMode = opts.blockMode ?? process.env.CLOSEOUT_CHECK_BLOCK === '1';
  const subject = opts.commitSubject ?? latestCommitSubject();
  const overridden = subject.includes(OVERRIDE_MARKER);
  const fetchers = opts.fetchers || { listOpenPRs: cliListOpenPRs, getIssue: cliGetIssue };
  const findings = overridden ? [] : await scanOpenPRs(fetchers);
  return decide(findings, { blockMode, overridden });
}

if (require.main === module) {
  run().then((result) => {
    (result.exitCode === 0 ? console.log : console.warn)(result.message);
    process.exit(result.exitCode);
  }).catch((err) => {
    console.warn(`[closeout-check] skipped (non-fatal): ${err && err.message}`);
    process.exit(0);
  });
}

module.exports = { decide, run, OVERRIDE_MARKER };
