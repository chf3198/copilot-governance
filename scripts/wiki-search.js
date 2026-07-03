#!/usr/bin/env node
'use strict';
// wiki-search.js — Global wiki search (works from any repo)
// Deployed to ~/.copilot/scripts/wiki-search.js and ~/.codex/devenv-ops/scripts/wiki-search.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const WIKI_DIR = process.env.WIKI_DIR || [
  path.join(process.env.HOME || '', '.copilot', 'wiki'),
  path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'devenv-ops', 'wiki'),
].find((dir) => fs.existsSync(dir));

function listPages() {
  const dirs = ['entities', 'concepts', 'sources', 'syntheses'];
  const pages = [];
  for (const d of dirs) {
    const dp = path.join(WIKI_DIR, d);
    if (!fs.existsSync(dp)) continue;
    for (const f of fs.readdirSync(dp).filter((x) => x.endsWith('.md'))) {
      pages.push({ slug: f.replace('.md', ''), type: d, path: path.join(dp, f) });
    }
  }
  return pages;
}

function searchPages(question, pages) {
  const qWords = question.toLowerCase().split(/\s+/);
  const scored = pages.map((p) => {
    const content = fs.readFileSync(p.path, 'utf-8').toLowerCase();
    const hits = qWords.filter((w) => content.includes(w)).length;
    return { ...p, score: hits };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((p) => p.score > 0).slice(0, 5);
}

function main() {
  const question = process.argv.slice(2).join(' ');
  if (!question) {
    console.log('Usage: node wiki-search.js "your question"');
    process.exit(1);
  }
  if (!fs.existsSync(WIKI_DIR)) {
    console.error(`❌ Wiki not found at ${WIKI_DIR}`);
    console.error('Run: npm run deploy:apply or npm run deploy:codex:apply (in devenv-ops)');
    process.exit(1);
  }
  const pages = listPages();
  if (pages.length === 0) {
    console.log('📋 Wiki is empty.');
    process.exit(0);
  }
  console.log(`🔍 Query: ${question}`);
  console.log(`📚 Wiki: ${WIKI_DIR} (${pages.length} pages)\n`);
  const relevant = searchPages(question, pages);
  if (relevant.length === 0) {
    console.log('No relevant pages found.');
    process.exit(0);
  }
  console.log(`📄 ${relevant.length} match(es):\n`);
  for (const p of relevant) {
    console.log(`## [[${p.slug}]] (${p.type}, score: ${p.score})`);
    const lines = fs.readFileSync(p.path, 'utf-8').split('\n');
    const body = lines.filter((l) => !l.startsWith('---')).slice(0, 8);
    console.log(body.join('\n') + '\n');
  }
}

main();
