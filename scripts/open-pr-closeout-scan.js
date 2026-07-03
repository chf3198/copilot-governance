#!/usr/bin/env node
'use strict';
// open-pr-closeout-scan (#3025 AC1) — pre-session-end advisory.
//
// Detects open PRs whose linked issue has no CONSULTANT_CLOSEOUT (and no
// `merge-evidence-deferred-final` marker), so a session never quietly ends with
// a baton left incomplete. Advisory by design: it WARNS and exits 0 so it can run
// at session boundary without blocking. Sibling #3028 reuses `scanOpenPRs` to wire
// the same detection into a pre-push lefthook gate (anti-duplication, G2/G10).

const { execFileSync } = require('node:child_process');

const LINKED_ISSUE = /\b(?:Refs|Closes|Fixes|Resolves|merge-evidence-deferred-final)\s*:?\s*#(\d+)/gi;
const CLOSEOUT_MARKER = /CONSULTANT_CLOSEOUT|merge-evidence-deferred-final/i;

/** Pull the linked issue numbers out of a PR body. */
function linkedIssues(prBody) {
  const issues = new Set();
  for (const match of String(prBody || '').matchAll(LINKED_ISSUE)) issues.add(Number(match[1]));
  return [...issues];
}

/** True when any comment on the issue carries a closeout marker. */
function issueHasCloseout(issue) {
  return (issue.comments || []).some((comment) => CLOSEOUT_MARKER.test(comment.body || ''));
}

/**
 * Core detection — pure aside from the two injected async fetchers (so tests pass fakes).
 * @param {{ listOpenPRs: () => Promise<Array<{number:number,body:string}>>,
 *           getIssue: (n:number) => Promise<{comments:Array<{body:string}>}> }} fetchers
 * @returns {Promise<Array<{pr:number, issue:number}>>} PRs whose linked issue lacks a closeout.
 */
async function scanOpenPRs({ listOpenPRs, getIssue }) {
  const findings = [];
  const prs = await listOpenPRs();
  for (const pr of prs || []) {
    for (const issueNumber of linkedIssues(pr.body)) {
      const issue = await getIssue(issueNumber);
      if (!issue || !issueHasCloseout(issue)) findings.push({ pr: pr.number, issue: issueNumber });
    }
  }
  return findings;
}

// ---- CLI fetchers (gh; degrade gracefully — advisory must never hard-fail) ----
function ghJson(args) {
  try { return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }) || 'null'); }
  catch { return null; }
}
const cliListOpenPRs = async () => ghJson(['pr', 'list', '--state', 'open', '--json', 'number,body']) || [];
const cliGetIssue = async (issueNumber) =>
  ghJson(['issue', 'view', String(issueNumber), '--json', 'comments']) || { comments: [] };

async function main() {
  const findings = await scanOpenPRs({ listOpenPRs: cliListOpenPRs, getIssue: cliGetIssue });
  if (findings.length === 0) {
    console.log('[closeout-advisory] OK — no open PR has a linked issue missing CONSULTANT_CLOSEOUT.');
    return 0;
  }
  console.warn(`[closeout-advisory] WARNING — ${findings.length} open PR(s) have a linked issue missing CONSULTANT_CLOSEOUT:`);
  for (const finding of findings) {
    console.warn(`  - PR #${finding.pr} -> issue #${finding.issue}: post CONSULTANT_CLOSEOUT before ending the session.`);
  }
  // advisory by contract (AC1): warn, never block the session boundary.
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.warn(`[closeout-advisory] skipped (non-fatal): ${err && err.message}`);
    process.exit(0);
  });
}

module.exports = { linkedIssues, issueHasCloseout, scanOpenPRs };
