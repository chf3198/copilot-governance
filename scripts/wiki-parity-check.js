#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const HOME = os.homedir();

const WIKI_PATHS = {
  copilot: path.join(HOME, '.copilot', 'wiki'),
  codex: path.join(HOME, '.codex', 'devenv-ops', 'wiki'),
  'claude-code': path.join(HOME, '.copilot', 'wiki'),
  antigravity: path.join(HOME, '.copilot', 'wiki'),
};

const SEARCH_SCRIPTS = {
  copilot: path.join(HOME, '.copilot', 'scripts', 'wiki-search.js'),
  codex: path.join(HOME, '.codex', 'devenv-ops', 'scripts', 'wiki-search.js'),
  'claude-code': null,
  antigravity: null,
};

const SUBDIR_TIERS = {
  required: ['concepts', 'entities'],
  'optional': ['skills'],
  'ingest-only': ['sources', 'syntheses'],
};

function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function fileHash(fPath) {
  try { return sha256(fs.readFileSync(fPath, 'utf8')); }
  catch { return null; }
}

function exists(filePath) { return fs.existsSync(filePath); }

function add(findings, id, severity, summary, evidence, recommendation) {
  findings.push({ id, severity, summary, evidence, recommendation });
}

function checkRuntime(findings, rt, digestManifest, runtimeTiers) {
  const wikiPath = WIKI_PATHS[rt];
  const indexFile = path.join(wikiPath, 'index.md');
  if (!exists(indexFile)) {
    add(findings, `wiki-${rt}-index-missing`, rt === 'claude-code' ? 'medium' : 'high',
      `${rt} wiki index.md missing.`, `Expected: ${indexFile}`,
      rt === 'copilot' ? 'npm run deploy:apply' : rt === 'codex' ? 'npm run deploy:codex:apply' : 'Deploy Copilot runtime');
  } else if (digestManifest && digestManifest[rt] && digestManifest[rt].indexMd) {
    const observed = fileHash(indexFile);
    if (observed && observed !== digestManifest[rt].indexMd) {
      add(findings, `wiki-${rt}-index-hash-mismatch`, 'high',
        `${rt} index.md digest mismatch.`,
        `Observed: ${observed}; Expected: ${digestManifest[rt].indexMd}`,
        `Verify wiki content; hash mismatch may indicate tampering or drift`);
    }
  }
  const searchScript = SEARCH_SCRIPTS[rt];
  if (searchScript && !exists(searchScript)) {
    add(findings, `wiki-${rt}-search-missing`, 'medium', `${rt} wiki-search.js missing.`,
      `Expected: ${searchScript}`, rt === 'copilot' ? 'npm run deploy:apply' : 'npm run deploy:codex:apply');
  }
  if (rt === 'claude-code' || rt === 'antigravity') {
    add(findings, `wiki-${rt}-depends-on-copilot`, 'low',
      `${rt} wiki read-only; depends_on copilot.wiki.`, `wikiPath: ${wikiPath} (cross-runtime)`, 'Expected design; no action required');
    return;
  }
  const tiers = runtimeTiers && runtimeTiers[rt] ? runtimeTiers[rt] : { required: SUBDIR_TIERS.required };
  for (const sub of tiers.required) {
    if (!exists(path.join(wikiPath, sub))) {
      add(findings, `wiki-${rt}-${sub}-missing`, 'medium',
        `${rt} wiki missing required subdir: ${sub}.`, `Expected: ${path.join(wikiPath, sub)}`,
        rt === 'copilot' ? 'npm run deploy:apply' : 'npm run deploy:codex:apply');
    }
  }
}

function run(options = {}) {
  const { digestManifest = null, runtimeTiers = null } = options;
  const findings = [];
  const dependencies = [];
  if (digestManifest || runtimeTiers) {
    dependencies.push({ from: 'claude-code', to: 'copilot', type: 'cross-runtime-read', status: 'expected' });
    dependencies.push({ from: 'antigravity', to: 'copilot', type: 'cross-runtime-read', status: 'expected' });
  }
  for (const rt of ['copilot', 'codex', 'claude-code', 'antigravity']) checkRuntime(findings, rt, digestManifest, runtimeTiers);
  return {
    ok: findings.filter(f => f.severity === 'high').length === 0,
    surface: 'wiki_docs_memory',
    checkedAt: new Date().toISOString(),
    wikiPaths: WIKI_PATHS,
    dependencies,
    findings,
  };
}

if (require.main === module) {
  const result = run();
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else for (const finding of result.findings) process.stdout.write(`${finding.severity}: ${finding.id} - ${finding.summary}\n`);
  process.exit(process.argv.includes('--strict') && !result.ok ? 1 : 0);
}

module.exports = { run, WIKI_PATHS, SEARCH_SCRIPTS, SUBDIR_TIERS, fileHash, sha256 };
