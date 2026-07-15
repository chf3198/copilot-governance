#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { classify } = require('./governance-drift-classifier');

const root = path.resolve(__dirname, '..', '..');
const dir = path.join(root, 'tickets');
const logsDir = path.join(root, 'logs');

function tickets() {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.md'))) {
    const p = path.join(dir, f), txt = fs.readFileSync(p, 'utf8');
    const n = +(txt.match(/^# Ticket\s+(\d+)\s+—/m)?.[1] || 0);
    const pri = txt.match(/^Priority:\s*(P\d)\b/m)?.[1] || '';
    const st = txt.match(/^Status:\s*(.+)$/m)?.[1] || '';
    const blocker = /BLOCKER_NOTE|owner\s*:|unblock_condition\s*:|eta_or_review_time\s*:/i.test(txt);
    out.push({ file: f, number: n, priority: pri, status: st, blocker, mtimeMs: fs.statSync(p).mtimeMs });
  }
  return out;
}

function verify() {
  let raw;
  try {
    raw = execSync('node scripts/global/governance-verify.js --json', { cwd: root, encoding: 'utf8' });
  } catch (err) {
    raw = err.stdout || '{}';
  }
  return JSON.parse(raw);
}

function recommendations(m) {
  const r = [];
  if (m.failedChecks > 0) r.push('Escalate remediation tickets for current verifier failures.');
  if (m.staleReadyP0P1 > 0) r.push('Apply ready-state SLA escalation and assign blocker owners.');
  if (m.evidenceFailures > 0) r.push('Backfill GitHub evidence blocks before additional closures.');
  return r.length ? r : ['No escalation required. Maintain current controls.'];
}

function run() {
  const now = Date.now(), cutoff = 24 * 60 * 60 * 1000;
  const v = verify(), list = tickets();
  const terminal = s => /^done\s*\(`closed`\)/i.test(s) || /^cancelled/i.test(s);
  const staleReady = list.filter(t => /^ready\b/i.test(t.status) && /^P[01]$/.test(t.priority)
    && now - t.mtimeMs > cutoff && !t.blocker).length;
  const dc = classify(v.issues || []);
  const driftByClass = { open: dc.open.length, terminal: dc.terminal.length, epic: dc.epic.length };
  const out = {
    generatedAt: new Date().toISOString(),
    metrics: {
      checkedTickets: v.checkedTickets,
      openTickets: list.filter(t => !terminal(t.status)).length,
      failedChecks: v.failedChecks,
      epicIntegrityFailures: v.issues.filter(i => i.includes('epic closed with open children')).length,
      evidenceFailures: v.issues.filter(i => i.includes('missing GitHub Evidence Block')).length,
      staleReadyP0P1: staleReady, driftByClass
    },
    recommendations: recommendations({ failedChecks: v.failedChecks, staleReadyP0P1: staleReady,
      evidenceFailures: v.issues.filter(i => i.includes('missing GitHub Evidence Block')).length })
  };
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, 'governance-weekly.json'), JSON.stringify(out, null, 2));
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  fs.writeFileSync(path.join(logsDir, `governance-weekly-${stamp}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

run();
