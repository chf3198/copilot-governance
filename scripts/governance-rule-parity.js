'use strict';

const fs = require('node:fs');
const path = require('node:path');
const mergeGate = require('./megalint/merge-evidence-pr-gate');
const adminGate = require('./megalint/admin-handoff');
const collabGate = require('./megalint/collaborator-handoff');

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_FILE = path.join(ROOT, 'logs', 'governance-rule-parity.json');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sameSet(a, b) { return a.length === b.length && a.every(v => b.includes(v)); }
function severity(introduced, carvedOut) { return carvedOut ? 'advisory' : introduced ? 'hard' : 'advisory'; }

function buildFindings() { const findings = [];
  const template = read('.github/PULL_REQUEST_TEMPLATE.md');
  if (/Refs #/.test(template) && /auto-close keyword/i.test(read('scripts/global/megalint/merge-evidence-pr-gate.js'))) {
    findings.push({
      id: 'merge-evidence-linkage-drift', class: 'doc-vs-enforcement', conflictClass: 'doc-vs-enforcement',
      summary: 'PR template warns against auto-close while merge gate requires it.',
      evidence: ['.github/PULL_REQUEST_TEMPLATE.md', 'scripts/global/megalint/merge-evidence-pr-gate.js'],
      recommendation: 'Keep the executable gate as source of truth until the policy decision is reconciled.',
      resolution: 'exception-tagged', carvedOut: true, introduced: false, severity: 'advisory',
    });
  }
  const lanes = [mergeGate.LIGHTWEIGHT_LANES, adminGate.LIGHTWEIGHT, collabGate.LIGHTWEIGHT].map(x => [...x].sort());
  if (!sameSet(lanes[0], lanes[1]) || !sameSet(lanes[0], lanes[2])) {
    findings.push({
      id: 'lightweight-set-drift', class: 'enforcement-vs-enforcement', conflictClass: 'enforcement-vs-enforcement',
      summary: 'Megalint validators disagree on the lightweight lane bypass set.',
      evidence: lanes.map((set, index) => ({ index, set })),
      recommendation: 'Hoist the lane set into one shared module and import it from all validators.',
      resolution: 'needs-reconciliation', carvedOut: false, introduced: false, severity: 'advisory',
    });
  }
  findings.push({
    id: 'lane-enum-drift', class: 'enum-drift', conflictClass: 'enum-drift',
    summary: 'Current lane-related rule surfaces are not normalized to one shared contract.',
    evidence: ['role-baton-routing instructions, PR template, and validator skip-sets expose non-identical lane vocabularies'],
    recommendation: 'Add a canonical lane enum and generate all lane-dependent surfaces from it.',
    resolution: 'needs-reconciliation', carvedOut: false, introduced: false, severity: 'advisory',
  });
  return findings;
}

function dedupeFindings(findings) { return [...new Map(findings.map(f => [f.id, f])).values()]; }

function classifyFindings(findings, options = {}) {
  const introduced = new Set(options.introducedFindings || []);
  const carveOuts = new Set(options.carveOuts || []);
  const openIssues = new Set(options.openDriftIssues || []);
  const annotated = findings.map(finding => {
    const isCarvedOut = carveOuts.has(finding.id) || finding.carvedOut === true;
    const isIntroduced = introduced.has(finding.id);
    const isDuplicateOpenIssue = openIssues.has(finding.id);
    return {
      ...finding,
      carvedOut: isCarvedOut,
      introduced: isIntroduced,
      duplicateOpenIssue: isDuplicateOpenIssue,
      severity: severity(isIntroduced, isCarvedOut),
    };
  });
  return {
    findings: annotated,
    newFindings: annotated.filter(f => !f.duplicateOpenIssue),
    duplicateOpenIssues: annotated.filter(f => f.duplicateOpenIssue),
    suppressedFindings: annotated.filter(f => f.carvedOut),
    blocked: annotated.some(f => f.introduced && !f.carvedOut),
  };
}

function run(options = {}) {
  const findings = dedupeFindings(buildFindings());
  const classified = classifyFindings(findings, options);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.mode || 'nightly',
    status: classified.findings.length ? 'drift-detected' : 'no-drift',
    ...classified,
  };
  if (options.write !== false) {
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (require.main === module) {
  const report = run({ mode: process.argv.includes("--pr") ? "pr" : "nightly" });
  const json = process.argv.includes('--json') || process.argv.includes('--strict');
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else for (const finding of report.findings) process.stdout.write(`${finding.severity}: ${finding.id} - ${finding.summary}\n`);
  process.exit(process.argv.includes('--strict') && report.blocked ? 1 : 0);
}

module.exports = { REPORT_FILE, buildFindings, dedupeFindings, classifyFindings, run };
