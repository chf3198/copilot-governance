'use strict';
// Refs #2801 — corpus-overlap stage for /research-redteam-loop.
// Reuses the #2617 tokenizer (lint-ticket-redundancy.js getTokens/normalizeToken).
// Adds: design-scope scanning over OPEN+CLOSED issues (the documented near-miss
// #2518 was a CLOSED epic, so open-only scanning would reproduce the exact miss),
// and an overlap-coefficient metric suited to the size-asymmetry between a long
// design deliverable and a short ticket.
const cp = require('child_process');
const fs = require('fs');
const { getTokens } = require('./lint-ticket-redundancy');

const REDUNDANCY_THRESHOLD = Number(process.env.CORPUS_OVERLAP_REDUNDANCY || 0.45);
const OVERLAP_THRESHOLD = Number(process.env.CORPUS_OVERLAP_MIN || 0.25);
const MAX_ISSUE_SCAN = 800; // upper bound on issues fetched for the overlap corpus

function ghFetchAllIssues() {
  const out = cp.execFileSync('gh',
    ['issue', 'list', '--state', 'all', '--limit', String(MAX_ISSUE_SCAN),
      '--json', 'number,title,body,state'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(out);
}

// overlap coefficient = |A intersect B| / min(|A|,|B|) — robust to size asymmetry,
// unlike Jaccard which unfairly penalizes a large design scope against a short ticket.
function overlapCoefficient(scopeTokens, ticketTokens) {
  if (!scopeTokens.size || !ticketTokens.size) return 0;
  let inter = 0;
  for (const token of ticketTokens) if (scopeTokens.has(token)) inter++;
  return inter / Math.min(scopeTokens.size, ticketTokens.size);
}

function classify(similarity) {
  if (similarity >= REDUNDANCY_THRESHOLD) return 'redundancy';
  if (similarity >= OVERLAP_THRESHOLD) return 'overlap';
  return null; // below floor — not a candidate
}

function scanCorpusOverlap(scopeText, opts = {}) {
  const fetchIssues = opts.fetchIssues || ghFetchAllIssues;
  const exclude = new Set(opts.exclude || []);
  const issues = fetchIssues();
  const scopeTokens = getTokens(scopeText);
  const candidates = [];
  for (const issue of issues) {
    if (exclude.has(issue.number)) continue;
    const sim = overlapCoefficient(scopeTokens, getTokens(`${issue.title} ${issue.body || ''}`));
    const cls = classify(sim);
    if (!cls) continue;
    candidates.push({
      number: issue.number, title: issue.title,
      state: String(issue.state || '').toLowerCase(),
      similarity: Number(sim.toFixed(3)), classification: cls
    });
  }
  candidates.sort((a, b) => b.similarity - a.similarity);
  const hasRedundancy = candidates.some(c => c.classification === 'redundancy');
  const overlapLevel = hasRedundancy ? 'high' : candidates.length ? 'moderate' : 'none';
  return {
    overlapLevel, candidates,
    relatedTickets: candidates.map(c => `#${c.number}`),
    // 'gap' = the design addresses novel scope no existing ticket covers.
    finding: overlapLevel === 'none' ? 'gap' : overlapLevel
  };
}

function hasOverlapDecision(deliverableText) {
  return /^\s*overlap_decision\s*:\s*\S+/im.test(String(deliverableText || ''));
}

// AC3: block ACCEPT when overlap exists and no boundary decision is recorded.
function shouldBlockAccept(scanResult, deliverableText) {
  if (!scanResult || scanResult.overlapLevel === 'none') return false;
  return !hasOverlapDecision(deliverableText);
}

function buildOverlapBlock(scanResult) {
  const related = scanResult.relatedTickets.length ? scanResult.relatedTickets.join(' ') : 'none';
  const rows = scanResult.candidates.slice(0, 10).map(c =>
    `  - #${c.number} [${c.state}] ${c.classification} (overlap=${c.similarity}) — ${c.title}`);
  return [
    `related_tickets: ${related}`,
    `overlap_finding: ${scanResult.finding} (level=${scanResult.overlapLevel})`,
    ...(rows.length ? ['overlap_candidates:', ...rows] : []),
    scanResult.overlapLevel === 'none'
      ? 'overlap_decision: gap — no corpus match above floor; novel scope (record rationale if disputed).'
      : 'overlap_decision: <REQUIRED — classify each candidate overlap|conflict|redundancy|gap; record the boundary>'
  ].join('\n');
}

// AC2: reviewer-prompt fragment so the cross-family red-team validates the boundary.
function reviewerOverlapFragment(scanResult) {
  if (scanResult.overlapLevel === 'none') {
    return 'CORPUS-OVERLAP: no existing ticket overlaps this design scope above floor; ' +
      'confirm this is a genuine gap (novel work), not a missed match.';
  }
  return 'CORPUS-OVERLAP: the deterministic scan found the candidate tickets below. For EACH, judge ' +
    'whether the design is overlap, conflict, redundancy, or gap relative to it, and confirm the ' +
    'recorded boundary is correct (REJECT if a redundancy/conflict is unaddressed):\n' +
    scanResult.candidates.slice(0, 10).map(c =>
      `- #${c.number} [${c.state}] (overlap=${c.similarity}) ${c.title}`).join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const fi = args.indexOf('--scope-file');
  const scope = fi >= 0 ? fs.readFileSync(args[fi + 1], 'utf8')
    : args.filter(a => !a.startsWith('--')).join(' ');
  const result = scanCorpusOverlap(scope);
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : buildOverlapBlock(result));
}

module.exports = {
  scanCorpusOverlap, overlapCoefficient, classify, hasOverlapDecision,
  shouldBlockAccept, buildOverlapBlock, reviewerOverlapFragment
};
