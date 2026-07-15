#!/usr/bin/env node
'use strict';
/* eslint-disable jsdoc/require-jsdoc */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'planning', 'dep-graph.json');
const DEFAULT_LIMIT = 200;
const REL = {
  'depends-on': 'depends-on',
  'blocked-by': 'blocked-by',
  blocks: 'blocks',
  'coupled-with': 'coupled-with',
  refs: 'refs',
  'future-coupled': 'future-coupled',
};
function issueNums(text) {
  return [...String(text || '').matchAll(/#(\d+)/g)].map(m => Number(m[1]));
}
function normLabel(label) {
  return String(label || '').toLowerCase().replace(/\s+/g, '-');
}
function labels(issue) {
  return (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name)).filter(Boolean);
}
function parseTextEdges(issue) {
  const edges = [];
  for (const line of String(issue.body || '').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:[-*]\s*)?(Depends-on|Blocks|Blocked-by|Coupled-with|Refs|Future-Coupled)\s*:?\s+(.+)$/i);
    if (!m) continue;
    const type = REL[normLabel(m[1])];
    for (const to of issueNums(m[2])) {
      if (to !== issue.number) edges.push(edge(issue.number, to, type, 'text', line.trim()));
    }
  }
  return edges;
}
function edge(from, to, type, source, raw = '') {
  return { from: Number(from), to: Number(to), type, source: [source], raw, mismatch: false };
}
function nativeEdges(issue) {
  const items = issue.native_edges || issue.nativeEdges || issue.issue_dependencies || [];
  return items.map(e => edge(e.from || issue.number, e.to || e.number, e.type || 'github-dependency', 'github_api'));
}
function mergeEdges(edges) {
  const byKey = new Map();
  for (const e of edges) {
    const key = `${e.from}:${e.to}:${e.type}`;
    const existing = byKey.get(key);
    if (existing) existing.source = [...new Set([...existing.source, ...e.source])];
    else byKey.set(key, { ...e, source: [...e.source] });
  }
  const merged = [...byKey.values()].sort((a, b) => a.from - b.from || a.to - b.to || a.type.localeCompare(b.type));
  const pairs = new Map();
  for (const e of merged) {
    const key = `${e.from}:${e.to}`;
    const types = pairs.get(key) || new Set();
    types.add(e.type); pairs.set(key, types);
  }
  const mismatches = [];
  for (const e of merged) {
    if ((pairs.get(`${e.from}:${e.to}`) || new Set()).size > 1) {
      e.mismatch = true;
      mismatches.push({ from: e.from, to: e.to, types: [...pairs.get(`${e.from}:${e.to}`)].sort() });
    }
  }
  return { edges: merged, mismatches };
}
function buildGraph(issues, meta = {}) {
  const nodes = issues.map(i => ({
    id: i.number, title: i.title, state: i.state, labels: labels(i),
    updated_at: i.updatedAt || i.updated_at || null,
    native_dependency_summary: i.issue_dependencies_summary || null,
  })).sort((a, b) => a.id - b.id);
  const allEdges = issues.flatMap(i => [...parseTextEdges(i), ...nativeEdges(i)]);
  const { edges, mismatches } = mergeEdges(allEdges);
  return { schema_version: 1, generated_at: new Date().toISOString(), ...meta, nodes, edges, mismatches };
}
function fetchIssues(limit) {
  const fields = 'number,title,state,labels,body,updatedAt,url';
  const out = execFileSync('gh', ['issue', 'list', '--state', 'all', '--limit', String(limit), '--json', fields], { encoding: 'utf8' });
  return JSON.parse(out);
}
function main() {
  const args = process.argv.slice(2);
  const limit = Number(args[args.indexOf('--limit') + 1] || DEFAULT_LIMIT);
  const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : OUT;
  const graph = buildGraph(fetchIssues(limit), { source: 'gh issue list', limit });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(graph, null, 2)}\n`);
  console.log(JSON.stringify(graph, null, 2));
}

if (require.main === module) main();
module.exports = { issueNums, parseTextEdges, nativeEdges, mergeEdges, buildGraph };
