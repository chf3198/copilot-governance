#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');

const parentRx = /##\s+Parent Epic\s*\n#(\d+)/i;
const uniq = items => [...new Set(items)].sort((a, b) => a - b);
const refs = (txt, rx) => [...(txt || '').matchAll(rx)].map(m => +m[1]);
const gh = args => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
const json = args => JSON.parse(gh(args));
const existsPr = number => {
  try { gh(['pr', 'view', String(number), '--json', 'number']); return true; }
  catch { return false; }
};

/**
 * Verify linked-child coverage and PR evidence on a live GitHub epic.
 * @param {string|number} issue Epic issue number to inspect on GitHub.
 * @returns {{issue:number,title:string,state:string,linkedChildren:number[],progressRefs:number[],closeoutRefs:number[],closeoutPrs:number[],warnings:string[],errors:string[],status:string}} Structured evidence report for the epic.
 */
function verifyEpicEvidence(issue) {
  const epic = json(['issue', 'view', String(issue), '--json', 'number,title,state,labels,comments']);
  const issues = json(['issue', 'list', '--state', 'all', '--limit', '500', '--json', 'number,title,body,state']);
  const linked = issues.filter(item => String(item.body || '').match(parentRx)?.[1] === String(issue));
  const linkedIds = uniq(linked.map(item => item.number));
  const closedIds = uniq(linked.filter(item => item.state === 'CLOSED').map(item => item.number));
  const comments = epic.comments || [];
  const progressRefs = uniq(comments.flatMap(item => /##\s+Epic Progress Update/m.test(item.body || '') ? refs(item.body, /#(\d+)/g) : []));
  const closeout = comments.find(item => /##\s+CONSULTANT_CLOSEOUT/m.test(item.body || ''));
  const closeoutRefs = uniq(refs(closeout?.body, /#(\d+)/g));
  const closeoutPrs = uniq((closeout?.body || '').split('\n').flatMap(line => /\bPRs?\b|pull request/i.test(line) ? refs(line, /#(\d+)/g) : []));
  const staleNoise = comments.filter(item => /github-actions/i.test(item.author?.login || '') && /label|status:|role:/i.test(item.body || '')).length;
  const errors = [];
  const warnings = [];
  const missingProgress = closedIds.filter(id => !progressRefs.includes(id));
  const missingCloseout = linkedIds.filter(id => !closeoutRefs.includes(id));
  const missingPrs = closeoutPrs.filter(id => !existsPr(id));
  if (!closeout) errors.push(`epic #${issue}: missing CONSULTANT_CLOSEOUT comment`);
  if (missingProgress.length) errors.push(`epic #${issue}: progress updates missing linked children ${missingProgress.join(', ')}`);
  if (closeout && missingCloseout.length) errors.push(`epic #${issue}: closeout missing linked children ${missingCloseout.join(', ')}`);
  if (missingPrs.length) errors.push(`epic #${issue}: closeout references nonexistent PRs ${missingPrs.join(', ')}`);
  if (staleNoise) warnings.push(`epic #${issue}: stale governance comments remain (${staleNoise})`);
  return {
    issue: epic.number,
    title: epic.title,
    state: epic.state,
    linkedChildren: linkedIds,
    progressRefs,
    closeoutRefs,
    closeoutPrs,
    warnings,
    errors,
    status: errors.length ? 'fail' : warnings.length ? 'warn' : 'pass',
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const issue = args.find(arg => /^\d+$/.test(arg));
  const report = verifyEpicEvidence(issue);
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : `${report.status.toUpperCase()}: #${report.issue} ${report.title}`);
  if (!args.includes('--json')) report.errors.concat(report.warnings).forEach(item => console.log(`- ${item}`));
  process.exit(report.errors.length ? 1 : 0);
}

module.exports = { verifyEpicEvidence };