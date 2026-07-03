#!/usr/bin/env node
'use strict';
/* eslint-disable jsdoc/require-jsdoc */
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname, '..', '..');
const PROPOSALS = path.join(ROOT, 'planning', 'dep-proposals.json');
const GRAPH = path.join(ROOT, 'planning', 'dep-graph.json');
const DECISIONS = path.join(ROOT, 'planning', 'dep-decisions.json');
const ORDER = { blocks: 0, 'depends-on': 1, 'coupled-with': 2 };

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function keyOf(proposal) {
  return proposal.cache_key || [proposal.from, proposal.to, proposal.edge_type].join(':');
}
function sortProposals(items) {
  return [...items].sort((a, b) => (ORDER[a.edge_type] ?? 9) - (ORDER[b.edge_type] ?? 9) || b.confidence - a.confidence);
}
function enrich(proposal, nodes) {
  const from = nodes.get(proposal.from) || {};
  const to = nodes.get(proposal.to) || {};
  return { ...proposal, from_issue: { id: proposal.from, title: from.title || '' }, to_issue: { id: proposal.to, title: to.title || '' } };
}
function decisionFor(proposal, action, reason, nodes) {
  return { cache_key: keyOf(proposal), status: action, decided_at: new Date().toISOString(), reason: reason || '', proposal: enrich(proposal, nodes) };
}
async function promptText(query, input = process.stdin, output = process.stdout) {
  const rl = readline.createInterface({ input, output });
  return new Promise(resolve => rl.question(query, answer => { rl.close(); resolve(answer.trim()); }));
}
async function ask(proposal, nodes, opts = {}) {
  const from = nodes.get(proposal.from) || {};
  const to = nodes.get(proposal.to) || {};
  const write = opts.write || (text => process.stdout.write(text));
  write('\n#' + proposal.from + ' -> #' + proposal.to + ' ' + proposal.edge_type + ' (' + proposal.confidence + ')\n');
  write((from.title || '') + '\n' + (to.title || '') + '\n' + (proposal.rationale || '') + '\n');
  const answer = await (opts.ask || promptText)('[a]ccept [r]eject [s]kip s[u]ppress? ');
  const choice = answer.toLowerCase()[0];
  if (choice === 'a') return decisionFor(proposal, 'accepted', '', nodes);
  if (choice === 'r') return decisionFor(proposal, 'rejected', '', nodes);
  if (choice !== 'u') return decisionFor(proposal, 'skipped', '', nodes);
  return decisionFor(proposal, 'suppressed', await (opts.ask || promptText)('Suppress reason: '), nodes);
}
async function review(opts = {}) {
  const proposals = readJson(opts.proposals || PROPOSALS, { proposals: [] });
  const graph = readJson(opts.graph || GRAPH, { nodes: [] });
  const decisions = readJson(opts.decisions || DECISIONS, { schema_version: 1, decisions: [] });
  const nodes = new Map((graph.nodes || []).map(n => [n.id, n]));
  const seen = new Set((decisions.decisions || []).filter(d => d.status !== 'skipped').map(d => d.cache_key));
  const pending = sortProposals(proposals.proposals || []).filter(p => !seen.has(keyOf(p)));
  const made = [];
  for (const proposal of pending) {
    const decision = await ask(proposal, nodes, opts);
    if (decision.status !== 'skipped') decisions.decisions.push(decision);
    made.push(decision);
  }
  decisions.updated_at = new Date().toISOString();
  if (opts.write !== false) {
    const outFile = opts.decisions || DECISIONS;
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(decisions, null, 2) + '\n');
  }
  return { reviewed: made.length, persisted: made.filter(d => d.status !== 'skipped').length, decisions };
}
async function main() {
  const args = process.argv.slice(2);
  const val = (flag, d) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : d);
  const result = await review({ proposals: val('--proposals', PROPOSALS), graph: val('--graph', GRAPH), decisions: val('--decisions', DECISIONS) });
  console.log(JSON.stringify({ reviewed: result.reviewed, persisted: result.persisted }, null, 2));
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { review, sortProposals, decisionFor };
