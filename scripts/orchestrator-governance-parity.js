#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const wikiCheck = require('./wiki-parity-check');
const stateCheck = require('./state-store-parity-check');
const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'inventory', 'orchestrator-governance-parity.json');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
function read(rel) {
  const full = path.join(ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function hookCommands(config) {
  const events = Object.keys(config.hooks || {});
  const scripts = new Set();
  for (const groups of Object.values(config.hooks || {})) {
    const list = Array.isArray(groups) ? groups : [groups];
    for (const group of list) {
      const hooks = group.hooks || (group.command ? [group] : []);
      for (const hook of hooks) {
        const match = String(hook.command || '').match(/([^/\s"]+\.py)\b/);
        if (match) scripts.add(match[1]);
      }
    }
  }
  return { events, scripts: [...scripts].sort() };
}

function listNames(rel, suffix = '') {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true })
    .filter(e => suffix ? e.name.endsWith(suffix) : e.isDirectory())
    .map(e => suffix ? e.name.replace(suffix, '') : e.name)
    .sort();
}

function diff(expected, actual) {
  const actualSet = new Set(actual);
  return expected.filter(item => !actualSet.has(item));
}

function add(findings, id, severity, summary, evidence, recommendation) {
  findings.push({ id, severity, summary, evidence, recommendation });
}

function run() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const copilot = hookCommands(readJson('hooks/global-standards.json'));
  const codex = hookCommands(readJson('.codex/runtime-hooks.json'));
  const claude = readJson('.claude/settings.json');
  const findings = [];
  const missingCodexScripts = diff(manifest.requiredHookScripts, codex.scripts);
  const missingCommon = diff(manifest.commonHookEvents, codex.events);
  if (!claude.hooks) add(findings, 'claude-hooks-missing', 'high',
    'Claude Code has no repo-owned hook adapter configured.',
    '.claude/settings.json has no hooks key',
    'Add a Claude settings hook adapter or explicit parity waiver.');
  if (missingCodexScripts.length) add(findings, 'codex-hook-script-gap', 'high',
    'Codex does not wire every canonical gate script.',
    `missing: ${missingCodexScripts.join(', ')}`,
    'Map goal/context gates into Codex hooks or document waivers.');
  if (missingCommon.length) add(findings, 'codex-hook-event-gap', 'medium',
    'Codex is missing common lifecycle events.',
    `missing: ${missingCommon.join(', ')}`,
    'Wire supported events; waive unsupported runtime events only with proof.');
  if (!codex.events.includes('PermissionRequest')) add(findings, 'codex-permission-gap',
    'medium', 'Codex native PermissionRequest event is unmapped.',
    '.codex/runtime-hooks.json has no PermissionRequest entry',
    'Add a PermissionRequest adapter or documented no-op gate.');
  if (!/all/.test(read('scripts/deploy.sh')) || !/all/.test(read('scripts/sync.sh')))
    add(findings, 'all-target-missing',
    'high', 'Deploy/sync lacks an explicit all-three-runtimes target.',
    'scripts support copilot|codex|claude|both; both excludes Claude',
    'Add all target; keep both as compatibility alias only if documented.');
  const missingCommands = diff(listNames('skills'), listNames('.claude/commands', '.md'));
  if (missingCommands.length) add(findings, 'claude-command-gap', 'medium',
    'Claude Code command adapters do not cover all repo skills.',
    `missing ${missingCommands.length}: ${missingCommands.join(', ')}`,
    'Generate adapters or record per-skill waivers in the parity manifest.');
  const wikiParity = manifest.wikiDocsParity || {};
  const wiki = wikiCheck.run({ digestManifest: wikiParity.digestManifest, runtimeTiers: wikiParity.runtimeTiers });
  const stateStore = stateCheck.run({ stateStore: manifest.stateStoreParity, runtimes: manifest.runtimes });
  for (const stateFinding of stateStore.findings) findings.push(stateFinding);
  // Promote high/medium-severity wiki findings to top-level findings so ok:false is set correctly.
  // Low-severity wiki findings remain in observations.wiki.findings for informational drill-in only.
  for (const wf of (wiki.findings || [])) {
    if (wf.severity === 'high' || wf.severity === 'medium') {
      findings.push({ ...wf, id: `[wiki] ${wf.id}`, summary: `[wiki] ${wf.summary}` });
    }
  }
  return { ok: findings.length === 0, manifest: path.relative(ROOT, MANIFEST),
    checkedAt: new Date().toISOString(), observations: { copilot, codex, wiki, stateStore },
    findings };
}

if (require.main === module) {
  const result = run();
  const json = process.argv.includes('--json') || process.argv.includes('--strict');
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else for (const f of result.findings) process.stdout.write(`${f.severity}: ${f.id} - ${f.summary}\n`);
  process.exit(process.argv.includes('--strict') && !result.ok ? 1 : 0);
}

module.exports = { run, hookCommands, diff };
