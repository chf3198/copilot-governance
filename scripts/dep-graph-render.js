#!/usr/bin/env node
'use strict';
/* eslint-disable jsdoc/require-jsdoc */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULTS = { graph: path.join(ROOT, 'planning', 'dep-graph.json'),
  proposals: path.join(ROOT, 'planning', 'dep-proposals.json'), decisions: path.join(ROOT, 'planning', 'dep-decisions.json'),
  out: path.join(ROOT, 'planning', 'dependencies.md'), json: path.join(ROOT, 'planning', 'dependencies.json'),
};
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function asList(items) { return Array.isArray(items) ? items : []; }
function keyOf(item) { return item.cache_key || [item.from, item.to, item.edge_type || item.type].join(':'); }
function esc(text) { return String(text || '').replace(/[|"]/g, "'").replace(/\s+/g, ' ').trim(); }
function byIssue(a, b) { return a.id - b.id; } function byEdge(a, b) { return a.from - b.from || a.to - b.to || String(a.type).localeCompare(String(b.type)); }
function statusMap(decisions) { return new Map(asList(decisions.decisions).map(item => [item.cache_key, item.status])); }
function proposalEdges(proposals, decisions) {
  const statuses = statusMap(decisions);
  return asList(proposals.proposals).map(item => ({
    from: item.from, to: item.to, type: item.edge_type, confidence: item.confidence,
    status: statuses.get(keyOf(item)) || 'pending', cache_key: keyOf(item),
  })).sort(byEdge);
}
function mermaid(graph, proposals, decisions) {
  const nodes = asList(graph.nodes).sort(byIssue).map(node => '  N' + node.id + '["#' + node.id + ' ' + esc(node.title) + '"]');
  const edges = asList(graph.edges).sort(byEdge).map(edge => {
    const src = asList(edge.source).sort().join('+') || 'unknown';
    const state = edge.mismatch ? 'mismatch' : 'current';
    return '  N' + edge.from + ' -->|' + esc(edge.type) + ' [' + esc(src) + '; ' + state + ']| N' + edge.to;
  });
  const props = proposalEdges(proposals, decisions).map(item => {
    const conf = Number.isFinite(item.confidence) ? '; ' + item.confidence : '';
    return '  N' + item.from + ' -.->|' + esc(item.type) + ' [proposal:' + item.status + conf + ']| N' + item.to;
  });
  return ['graph TD', ...nodes, ...edges, ...props].join('\n');
}
function cycles(graph) {
  const out = new Map();
  for (const edge of asList(graph.edges).sort(byEdge)) out.set(edge.from, [...(out.get(edge.from) || []), edge.to]);
  const found = new Set();
  function walk(node, stack = []) {
    if (stack.includes(node)) {
      const body = stack.slice(stack.indexOf(node)); const start = body.indexOf(Math.min(...body));
      found.add([...body.slice(start), ...body.slice(0, start), body[start]].join(' -> ')); return;
    }
    for (const next of out.get(node) || []) walk(next, [...stack, node]);
  }
  for (const node of asList(graph.nodes).sort(byIssue)) walk(node.id);
  return [...found].sort();
}
function criticalPath(graph) {
  const cycleNodes = new Set(cycles(graph).flatMap(cycle => cycle.split(' -> ').map(Number)));
  const out = new Map();
  for (const edge of asList(graph.edges).sort(byEdge)) {
    if (!cycleNodes.has(edge.from) && !cycleNodes.has(edge.to)) out.set(edge.from, [...(out.get(edge.from) || []), edge.to]);
  }
  const memo = new Map();
  function best(node) {
    if (memo.has(node)) return memo.get(node);
    const paths = (out.get(node) || []).map(next => [node, ...best(next)]);
    const result = paths.sort((a, b) => b.length - a.length || a.join(',').localeCompare(b.join(',')))[0] || [node];
    memo.set(node, result); return result;
  }
  return asList(graph.nodes).map(node => best(node.id)).sort((a, b) => b.length - a.length || a.join(',').localeCompare(b.join(',')))[0] || [];
}
function summary(graph, proposals, decisions, now = null) {
  const props = proposalEdges(proposals, decisions), generatedAt = now || graph.generated_at || decisions.updated_at || 'unknown';
  const propKeys = new Set(props.map(item => item.cache_key));
  const staleDecisions = asList(decisions.decisions).filter(item => !propKeys.has(item.cache_key)).map(item => item.cache_key).sort();
  return {
    schema_version: 1, generated_at: generatedAt, graph_generated_at: graph.generated_at || null,
    decisions_updated_at: decisions.updated_at || null,
    counts: { nodes: asList(graph.nodes).length, edges: asList(graph.edges).length, proposals: props.length },
    critical_path: criticalPath(graph), cycles: cycles(graph),
    proposal_statuses: props.reduce((map, item) => ({ ...map, [item.status]: (map[item.status] || 0) + 1 }), {}),
    stale: { pending_proposals: props.filter(item => item.status === 'pending').map(item => item.cache_key), decisions_without_proposal: staleDecisions },
  };
}
function renderMarkdown(graph, proposals, decisions, now) {
  const data = summary(graph, proposals, decisions, now);
  const cp = data.critical_path.length ? data.critical_path.map(id => '#' + id).join(' -> ') : 'none';
  const cy = data.cycles.length ? data.cycles.join('; ') : 'none';
  return ['# Dependency Graph', '', 'Generated at: ' + data.generated_at, 'Graph refreshed at: ' + (data.graph_generated_at || 'unknown'), 'Decisions updated at: ' + (data.decisions_updated_at || 'unknown'), '', '## Mermaid', '', '~~~mermaid', mermaid(graph, proposals, decisions), '~~~', '', '## Summary', '', '- Nodes: ' + data.counts.nodes, '- Edges: ' + data.counts.edges, '- Proposals: ' + data.counts.proposals, '- Critical path: ' + cp, '- Cycles: ' + cy, '- Pending proposals: ' + data.stale.pending_proposals.length, '- Stale decisions: ' + data.stale.decisions_without_proposal.length, ''].join('\n');
}
function main() {
  const args = process.argv.slice(2);
  const val = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
  const graph = readJson(val('--graph', DEFAULTS.graph), { nodes: [], edges: [] });
  const proposals = readJson(val('--proposals', DEFAULTS.proposals), { proposals: [] });
  const decisions = readJson(val('--decisions', DEFAULTS.decisions), { decisions: [] });
  const out = val('--out', DEFAULTS.out); const json = val('--json', DEFAULTS.json);
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.mkdirSync(path.dirname(json), { recursive: true });
  const generatedAt = graph.generated_at || decisions.updated_at || 'unknown';
  fs.writeFileSync(out, renderMarkdown(graph, proposals, decisions, generatedAt));
  fs.writeFileSync(json, JSON.stringify(summary(graph, proposals, decisions, generatedAt), null, 2) + '\n');
  console.log(JSON.stringify({ out, json }, null, 2));
}
if (require.main === module) main();
module.exports = { mermaid, cycles, criticalPath, summary, renderMarkdown };
