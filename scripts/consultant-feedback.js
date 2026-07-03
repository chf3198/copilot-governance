#!/usr/bin/env node
'use strict';
// consultant-feedback.js — Manager backlog feedback bridge #681
// Converts consultant-checks.js FAIL results → GitHub backlog actions.
// Usage: node consultant-feedback.js --issue <N> --results <path> [--dry-run]
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const args = process.argv.slice(2);
const issueNum = +(args[args.indexOf('--issue') + 1] || 0);
const resultsPath = args[args.indexOf('--results') + 1] || '';
const dryRun = args.includes('--dry-run');
const root = path.resolve(__dirname, '..', '..');
const EPIC_ID = 'epic_id: 610';

const run = cmd => {
  try { return cp.execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch { return ''; }
};

function findExistingIssue(checkId) {
  const out = run(`gh issue list --state open --search "${checkId}" --json number,title,labels`);
  try {
    const issues = JSON.parse(out || '[]');
    return issues.find(i => i.title.includes(checkId)) || null;
  } catch { return null; }
}

function getPriorityNum(labels) {
  const tag = (labels || []).map(l => l.name || l).find(n => /^priority:P\d/.test(n));
  return tag ? parseInt(tag.replace('priority:P', ''), 10) : 9;
}

function augmentExisting(issue, check) {
  const changes = [];
  const existingP = getPriorityNum(issue.labels);
  const checkP = { critical: 0, high: 1, medium: 2, low: 3 }[check.severity] ?? 3;
  if (checkP < existingP) {
    if (!dryRun) {
      run(`gh issue edit ${issue.number} --remove-label "priority:P${existingP}" --add-label "priority:P${checkP}"`);
    }
    changes.push(`priority P${existingP}→P${checkP}`);
  }
  if (!dryRun) {
    const body = `**Consultant check \`${check.id}\` FAIL** (${new Date().toISOString().slice(0, 10)})\n` +
      `Finding: ${check.finding}\n` +
      (check.suggestedFix ? `Suggested fix: ${check.suggestedFix}\n` : '') +
      `Source: Refs #${issueNum}`;
    run(`gh issue comment ${issue.number} --body "${body.replace(/"/g, '\\"')}"`);
  }
  changes.push('+evidence');
  return { action: 'augmented', issue: issue.number, changes };
}

function createBacklogIssue(check) {
  const title = `fix: [${check.id}] ${check.finding.slice(0, 60)}`;
  const body = `**Check**: \`${check.id}\` (${check.domain})\n**Finding**: ${check.finding}\n` +
    (check.suggestedFix ? `**Suggested Fix**: ${check.suggestedFix}\n` : '') +
    `**Source**: Refs #${issueNum}\n\`check_id: ${check.id}\`\n\`${EPIC_ID}\``;
  if (dryRun) return { action: 'would-create', checkId: check.id };
  const out = run(`gh issue create --title "${title.replace(/"/g, '\\"')}" ` +
    `--body "${body.replace(/"/g, '\\"')}" ` +
    `--label "type:task,status:backlog,priority:P2,area:governance"`);
  const match = out.match(/issues\/(\d+)/);
  return { action: 'created', issue: match ? +match[1] : null };
}

function main() {
  if (!resultsPath || !issueNum) {
    console.error('Usage: consultant-feedback.js --issue <N> --results <path> [--dry-run]');
    process.exit(1);
  }
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const fails = results.filter(r => r.status === 'FAIL');
  const rows = [];

  for (const check of fails) {
    const existing = findExistingIssue(check.id);
    const outcome = existing ? augmentExisting(existing, check) : createBacklogIssue(check);
    rows.push({ checkId: check.id, ...outcome });
  }

  if (!dryRun && rows.length > 0) {
    postBrief(rows);
    emitEvent(rows.length);
  }

  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

function postBrief(rows) {
  const table = rows.map(r =>
    `| ${r.checkId} | ${r.action} | #${r.issue ?? '—'} | ${(r.changes || []).join(', ') || '—'} |`
  ).join('\n');
  const brief = `## 🔁 Consultant → Manager Remediation Brief\n` +
    `| Check | Action | Issue | Changes |\n|---|---|---|---|\n${table}`;
  run(`gh issue comment ${issueNum} --body "${brief.replace(/"/g, '\\"')}"`);
}

function emitEvent(count) {
  cp.execFileSync(process.execPath,
    [path.join(__dirname, 'emit-event.js'),
      '--type', 'consultant:feedback', '--issue', String(issueNum),
      '--role', 'consultant', '--agent', 'Copilot',
      '--detail', `${count} FAILs processed`],
    { cwd: root, stdio: 'inherit' });
}

main();
