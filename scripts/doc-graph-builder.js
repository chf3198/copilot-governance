#!/usr/bin/env node
// Refs #2153 — markdown-wikilink graph-builder
// Scans repo for [[wikilink]] syntax and writes deterministic adjacency-list to generated/doc-graph.json

const fs = require('fs');
const path = require('path');

const SCAN_DIRS = ['docs', 'wiki', 'instructions'];
const SCAN_FILES = ['README.md', 'vscode-extension/README.md', 'CHANGELOG.md'];
const OUTPUT_PATH = 'generated/doc-graph.json';

const WIKILINK_RE = /(?<!\\)\[\[([^\[\]\n]+?)\]\]/g;

function walkMd(rootDir, baseDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const full = path.join(rootDir, entry.name);
    const rel = path.relative(baseDir, full);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...walkMd(full, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(rel);
    }
  }
  return out;
}

function extractWikilinks(text) {
  const links = [];
  let match;
  WIKILINK_RE.lastIndex = 0;
  while ((match = WIKILINK_RE.exec(text)) !== null) {
    const target = match[1].split('|')[0].trim();
    if (target) links.push(target);
  }
  return links;
}

function collectScanFiles(baseDir) {
  const files = [];
  for (const dir of SCAN_DIRS) files.push(...walkMd(path.join(baseDir, dir), baseDir));
  for (const file of SCAN_FILES) {
    const full = path.join(baseDir, file);
    if (fs.existsSync(full)) files.push(file);
  }
  files.sort();
  return files;
}

function buildGraph(baseDir) {
  const files = collectScanFiles(baseDir);
  const nodes = files.map((file) => ({ id: `file:${file}`, type: 'doc' }));
  const linkTargets = new Set();
  const edges = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(baseDir, file), 'utf8');
    for (const target of extractWikilinks(text)) {
      edges.push({ from: `file:${file}`, to: `wikilink:${target}`, kind: 'wikilink' });
      linkTargets.add(target);
    }
  }
  for (const target of [...linkTargets].sort()) {
    nodes.push({ id: `wikilink:${target}`, type: 'wikilink-target' });
  }
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { version: 1, nodes, edges };
}

function writeGraph(baseDir, graph) {
  const outFull = path.join(baseDir, OUTPUT_PATH);
  fs.mkdirSync(path.dirname(outFull), { recursive: true });
  fs.writeFileSync(outFull, JSON.stringify(graph, null, 2) + '\n');
}

function main(baseDir = process.cwd()) {
  const graph = buildGraph(baseDir);
  writeGraph(baseDir, graph);
  return graph;
}

if (require.main === module) {
  const start = Date.now();
  const graph = main();
  const elapsed = Date.now() - start;
  process.stderr.write(
    `doc-graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${elapsed}ms -> ${OUTPUT_PATH}\n`,
  );
}

module.exports = { buildGraph, extractWikilinks, walkMd, collectScanFiles, main };
