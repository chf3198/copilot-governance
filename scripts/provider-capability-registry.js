#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const REGISTRY = path.join(__dirname, 'provider-capability-registry.json');
const REQUIRED = [
  'id',
  'toolsMcp',
  'hooks',
  'agentsSkills',
  'sandboxApproval',
  'cost',
  'telemetryConfidence',
  'citations',
];

function loadRegistry(file = REGISTRY) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function validateRecord(kind, record, levels) {
  const errors = [];
  for (const field of REQUIRED) {
    if (!record[field] || (Array.isArray(record[field]) && record[field].length === 0)) {
      errors.push(`${kind}:${record.id || 'unknown'} missing ${field}`);
    }
  }
  if (!levels.includes(record.telemetryConfidence)) {
    errors.push(`${kind}:${record.id} invalid telemetryConfidence`);
  }
  for (const citation of record.citations || []) {
    if (!/^https?:\/\//.test(citation) && !fs.existsSync(path.join(ROOT, citation))) {
      errors.push(`${kind}:${record.id} missing citation ${citation}`);
    }
  }
  return errors;
}

function validateRegistry(registry) {
  const levels = registry.confidenceLevels || [];
  const errors = [];
  for (const kind of ['runtimes', 'providers']) {
    for (const record of registry[kind] || []) {
      errors.push(...validateRecord(kind, record, levels));
    }
  }
  const runtimeIds = new Set((registry.runtimes || []).map(r => r.id));
  for (const provider of registry.providers || []) {
    if (runtimeIds.has(provider.id)) errors.push(`provider duplicates runtime id ${provider.id}`);
  }
  return errors;
}

function renderTable(title, records) {
  const rows = records.map(r =>
    `| ${r.id} | ${r.toolsMcp} | ${r.hooks} | ${r.agentsSkills} | ${r.sandboxApproval} | ${r.cost} | ${r.telemetryConfidence} |`
  );
  return [
    `## ${title}`,
    '',
    '| ID | Tools/MCP | Hooks | Agents/Skills | Sandbox/Approval | Cost | Telemetry |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function renderMarkdown(registry) {
  return [
    '# Provider Capability Registry',
    '',
    'Generated from `scripts/global/provider-capability-registry.json`.',
    `Owner boundary: ${registry.ownerBoundary}`,
    '',
    renderTable('Runtimes', registry.runtimes),
    renderTable('Providers', registry.providers),
    'Signed-by: Quill Harper  ',
    'Team&Model: codex:gpt-5.4@local  ',
    'Role: collaborator', ''].join('\n');
}

function main() {
  const registry = loadRegistry();
  const errors = validateRegistry(registry);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  if (process.argv.includes('--write-doc')) {
    fs.writeFileSync(path.join(ROOT, registry.generatedDoc), renderMarkdown(registry));
  } else {
    console.log(JSON.stringify({ ok: true, runtimes: registry.runtimes.length, providers: registry.providers.length }));
  }
}

if (require.main === module) main();
module.exports = { loadRegistry, validateRegistry, renderMarkdown };
