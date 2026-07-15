#!/usr/bin/env node
'use strict';
/* eslint-disable jsdoc/require-jsdoc */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const GRAPH = path.join(ROOT, 'planning', 'dep-graph.json');
const OUT = path.join(ROOT, 'planning', 'dep-proposals.json');
const PROMPT_VERSION = 'dep-proposal-v1';
const DEFAULT_MODEL = 'fleet:cascade-dispatch';
const DEFAULT_THRESHOLD = 0.85;
const STOP = new Set(['add', 'build', 'fix', 'the', 'and', 'for', 'with', 'into']);

function sha(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}
function labels(node) {
  return (node.labels || []).filter(l => /^(area|type):/.test(l)).sort();
}
function words(title) {
  const found = String(title || '').toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  return new Set(found.filter(w => !STOP.has(w)));
}
function cacheKey(a, b, model = DEFAULT_MODEL) {
  const issueHash = n => sha([n.id, n.title, labels(n).join(','), n.body || n.body_hash || ''].join('|'));
  return sha([PROMPT_VERSION, model, issueHash(a), issueHash(b)].join('|'));
}
function hasEdge(graph, from, to) {
  return (graph.edges || []).some(e => e.from === from && e.to === to);
}
function candidatePairs(graph, opts = {}) {
  const nodes = [...(graph.nodes || [])].filter(n => n.state !== 'CLOSED').sort((a, b) => a.id - b.id);
  const pairs = [];
  for (let i = 0; i < nodes.length; i += 1) for (let j = i + 1; j < nodes.length; j += 1) {
    const [a, b] = [nodes[i], nodes[j]];
    if (hasEdge(graph, a.id, b.id) || hasEdge(graph, b.id, a.id)) continue;
    const sharedLabels = labels(a).filter(l => labels(b).includes(l));
    const overlap = [...words(a.title)].filter(w => words(b.title).has(w));
    if (sharedLabels.length || overlap.length) pairs.push({ a, b, reason: { sharedLabels, overlap } });
  }
  return pairs.slice(0, opts.limit || 40);
}
function prompt(pair) {
  return `Return JSON only: {"edge_type":"depends-on|blocks|coupled-with|none","confidence":0-1,"rationale":"...","evidence_spans":["..."]}\nA #${pair.a.id}: ${pair.a.title}\nB #${pair.b.id}: ${pair.b.title}`;
}
function parseResult(raw, threshold = DEFAULT_THRESHOLD) {
  try {
    const text = typeof raw === 'string' ? raw : raw.content || JSON.stringify(raw);
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    const type = parsed.edge_type || parsed.type;
    const confidence = Number(parsed.confidence);
    if (!['depends-on', 'blocks', 'coupled-with', 'none'].includes(type) || Number.isNaN(confidence)) throw new Error('invalid');
    const status = type !== 'none' && confidence >= threshold ? 'proposed' : 'skipped';
    return { status, edge_type: type, confidence, rationale: parsed.rationale || '', evidence_spans: parsed.evidence_spans || [] };
  } catch {
    return { status: 'fallback', edge_type: 'none', confidence: 0, rationale: 'invalid model output', evidence_spans: [] };
  }
}
function runCascade(p) {
  const cmd = [path.join(__dirname, 'cascade-dispatch.js'), '--prompt', p, '--json'];
  return JSON.parse(execFileSync(process.execPath, cmd, { encoding: 'utf8' }));
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
async function augment(graph, opts = {}) {
  const threshold = opts.threshold || DEFAULT_THRESHOLD;
  const model = opts.model || DEFAULT_MODEL;
  const cache = readJson(opts.cache || '', { items: {} });
  const classify = opts.classify || (p => runCascade(p));
  const results = [];
  for (const pair of candidatePairs(graph, opts)) {
    const key = cacheKey(pair.a, pair.b, model);
    const parsed = parseResult(cache.items?.[key] || await classify(prompt(pair), pair), threshold);
    results.push({ from: pair.a.id, to: pair.b.id, cache_key: key, model: { id: model, prompt_version: PROMPT_VERSION }, candidate_reason: pair.reason, ...parsed });
  }
  return { schema_version: 1, generated_at: new Date().toISOString(), threshold, proposals: results.filter(r => r.status === 'proposed'), skipped: results.filter(r => r.status !== 'proposed') };
}
async function main() {
  const args = process.argv.slice(2);
  const val = (flag, d) => args.includes(flag) ? args[args.indexOf(flag) + 1] : d;
  const result = await augment(readJson(val('--graph', GRAPH), { nodes: [], edges: [] }), { limit: Number(val('--limit', 40)), threshold: Number(val('--threshold', DEFAULT_THRESHOLD)), cache: val('--cache', '') });
  const outFile = val('--out', OUT);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { candidatePairs, cacheKey, parseResult, augment };
