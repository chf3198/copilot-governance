#!/usr/bin/env node
// tier: 2
// rule-card-extractor.js — 8 typological adapters for governance rule-card
// extraction. Refs #2301 (Epic #2295 Phase-1 child P1.2).
// CommonJS for max cross-runtime portability (Claude Code/Codex/Copilot).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const GH_LABEL_LIMIT = 200;
const GH_TIMEOUT_MS = 10000;

const VALID_CLASSES = [
  'doc-vs-enforcement', 'enforcement-vs-enforcement', 'enum-drift',
  'doc-vs-no-enforcement', 'authority-carve-out',
  'cross-runtime-fragmentation', 'maintenance-drift',
  'context-substituting-for-guardrail',
];
const VALID_SEVERITIES = ['advisory', 'soft-mandatory', 'hard-mandatory'];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rel(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/');
}

function makeCard(fields) {
  return {
    rule_id: fields.rule_id || '',
    class: fields.class || 'doc-vs-no-enforcement',
    statement: (fields.statement || '').trim(),
    source: fields.source || '',
    enum_values: Array.isArray(fields.enum_values) ? fields.enum_values : [],
    severity: VALID_SEVERITIES.includes(fields.severity)
      ? fields.severity : 'advisory',
    cross_runtime_applicability: fields.cross_runtime_applicability || ['all'],
  };
}

function parseKV(raw) {
  const out = {};
  // Multi-line form: one key=value per line (fenced blocks)
  for (const line of raw.split(/\r?\n/)) {
    const ml = line.match(/^\s*([\w_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (ml) { out[ml[1]] = ml[2]; continue; }
  }
  // Single-line form: key=value key2="quoted value" (HTML comments)
  const singleRe = /([\w_]+)=(?:"([^"]*)"|(\S+))/g;
  let sm;
  while ((sm = singleRe.exec(raw)) !== null) {
    if (!out[sm[1]]) out[sm[1]] = sm[2] !== undefined ? sm[2] : sm[3];
  }
  return out;
}

function splitEnum(raw) {
  return (raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

function htmlCommentCards(src, srcRel) {
  const cards = [];
  const htmlRe = /<!--\s*rule-card:\s*([\s\S]*?)-->/g;
  let match;
  while ((match = htmlRe.exec(src)) !== null) {
    const kv = parseKV(match[1]);
    if (kv.rule_id) {
      cards.push(makeCard({ ...kv, source: srcRel,
        enum_values: splitEnum(kv.enum_values) }));
    }
  }
  return cards;
}

function fencedCards(src, srcRel) {
  const cards = [];
  const fenceRe = /```rule-card\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = fenceRe.exec(src)) !== null) {
    const kv = parseKV(match[1]);
    if (kv.rule_id) {
      cards.push(makeCard({ ...kv, source: srcRel,
        enum_values: splitEnum(kv.enum_values) }));
    }
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Adapter 1: instructions/*.md
// ---------------------------------------------------------------------------
function extractFromInstructions(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const srcRel = rel(filePath);
  return [...htmlCommentCards(src, srcRel), ...fencedCards(src, srcRel)];
}

// ---------------------------------------------------------------------------
// Adapter 2: .github templates
// ---------------------------------------------------------------------------
function extractFromTemplate(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  return htmlCommentCards(src, rel(filePath));
}

// ---------------------------------------------------------------------------
// Adapter 3: .github/workflows/*.yml — types: enum blocks
// ---------------------------------------------------------------------------
function workflowInlineCards(src, srcRel, baseName) {
  const cards = [];
  const inlineRe = /types\s*:\s*\[([^\]]+)\]/g;
  let match;
  while ((match = inlineRe.exec(src)) !== null) {
    const vals = match[1].split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''));
    if (vals.length > 1) {
      cards.push(makeCard({
        rule_id: `workflow-types-enum-${baseName}`,
        class: 'enum-drift',
        statement: `Workflow ${baseName}.yml constrains event types to a fixed enum.`,
        source: srcRel, enum_values: vals, severity: 'soft-mandatory',
        cross_runtime_applicability: ['all'],
      }));
    }
  }
  return cards;
}

function workflowMultilineCards(src, srcRel, baseName) {
  const cards = [];
  const mlRe = /\btypes\s*:\s*\n((?:\s+-[^\n]+\n)+)/g;
  let match;
  while ((match = mlRe.exec(src)) !== null) {
    const vals = match[1].split('\n')
      .map(l => l.replace(/^\s+-\s*/, '').trim()).filter(Boolean);
    if (vals.length > 1) {
      cards.push(makeCard({
        rule_id: `workflow-types-multiline-${baseName}`,
        class: 'enum-drift',
        statement: `Workflow ${baseName}.yml constrains event types to a fixed enum.`,
        source: srcRel, enum_values: vals, severity: 'soft-mandatory',
        cross_runtime_applicability: ['all'],
      }));
    }
  }
  return cards;
}

function extractFromWorkflow(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const srcRel = rel(filePath);
  const baseName = path.basename(filePath, '.yml');
  return [
    ...workflowInlineCards(src, srcRel, baseName),
    ...workflowMultilineCards(src, srcRel, baseName),
  ];
}

// ---------------------------------------------------------------------------
// Adapter 4: scripts/global/megalint/*.js and scripts/global/*.js
// ---------------------------------------------------------------------------
function extractFromValidator(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const srcRel = rel(filePath);
  const cards = [];
  const re = /const\s+([A-Z_][A-Z0-9_]*)\s*=\s*\[([^\]]+)\]/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    const vals = match[2].split(',')
      .map(s => s.trim().replace(/^['"`]|['"`]$/g, '')).filter(Boolean);
    if (vals.length > 1) {
      const constName = match[1];
      const slug = constName.toLowerCase().replace(/_/g, '-');
      const base = path.basename(filePath, '.js');
      cards.push(makeCard({
        rule_id: `validator-const-${slug}-${base}`,
        class: 'enum-drift',
        statement: `Validator ${base}.js enforces ${constName} as a fixed set.`,
        source: srcRel, enum_values: vals, severity: 'hard-mandatory',
        cross_runtime_applicability: ['all'],
      }));
    }
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Adapter 5: hooks/scripts/*.py
// ---------------------------------------------------------------------------
function extractFromHook(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const srcRel = rel(filePath);
  const cards = [];
  const re = /([A-Z_][A-Z0-9_]*)\s*=\s*[\[(]([^)\]]+)[\])]/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    const vals = match[2].split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(s => s.length > 0 && !s.startsWith('#'));
    if (vals.length > 1) {
      const slug = match[1].toLowerCase().replace(/_/g, '-');
      const base = path.basename(filePath, '.py');
      cards.push(makeCard({
        rule_id: `hook-const-${slug}-${base}`,
        class: 'enum-drift',
        statement: `Hook ${base}.py enforces ${match[1]} as a fixed set.`,
        source: srcRel, enum_values: vals, severity: 'soft-mandatory',
        cross_runtime_applicability: ['all'],
      }));
    }
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Adapter 6: lefthook.yml
// ---------------------------------------------------------------------------
function extractFromPrecommit(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const cmdNames = [];
  const cmdRe = /^\s{4}([a-z][a-z0-9_-]+)\s*:/gm;
  let match;
  while ((match = cmdRe.exec(src)) !== null) cmdNames.push(match[1]);
  if (cmdNames.length === 0) return [];
  return [makeCard({
    rule_id: 'lefthook-pre-commit-commands',
    class: 'enforcement-vs-enforcement',
    statement: 'lefthook.yml defines the set of pre-commit/pre-push gates '
      + 'that must all pass before a push is accepted.',
    source: rel(filePath), enum_values: cmdNames, severity: 'hard-mandatory',
    cross_runtime_applicability: ['claude-code', 'codex', 'copilot', 'antigravity'],
  })];
}

// ---------------------------------------------------------------------------
// Adapter 7: config/*.schema.json
// ---------------------------------------------------------------------------
function walkSchemaEnums(obj, pathParts, srcRel, baseName, cards) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj.enum) && obj.enum.length > 1) {
    const propName = pathParts[pathParts.length - 1] || 'root';
    const slug = `schema-enum-${baseName}-${propName}`
      .replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    cards.push(makeCard({
      rule_id: slug, class: 'enum-drift',
      statement: `Schema ${baseName}.json constrains ${pathParts.join('.')} to an enum.`,
      source: srcRel, enum_values: obj.enum.map(String), severity: 'soft-mandatory',
      cross_runtime_applicability: ['all'],
    }));
  }
  for (const [key, val] of Object.entries(obj)) {
    if (key !== 'enum' && val && typeof val === 'object') {
      walkSchemaEnums(val, [...pathParts, key], srcRel, baseName, cards);
    }
  }
}

function extractFromConfigSchema(filePath) {
  let data;
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return []; }
  const cards = [];
  walkSchemaEnums(data, [], rel(filePath), path.basename(filePath, '.json'), cards);
  return cards;
}

// ---------------------------------------------------------------------------
// Adapter 8: gh label list (best-effort)
// ---------------------------------------------------------------------------
function labelsToCards(labels) {
  const cards = [];
  const statusVals = labels.filter(l => l.startsWith('status:'));
  const roleVals = labels.filter(l => l.startsWith('role:'));
  const laneVals = labels.filter(l => l.startsWith('lane:'));
  if (statusVals.length > 0) {
    cards.push(makeCard({ rule_id: 'live-labels-status-enum', class: 'enum-drift',
      statement: 'Live GitHub label set defines the allowed status:* values.',
      source: 'gh:label-list', enum_values: statusVals, severity: 'hard-mandatory',
      cross_runtime_applicability: ['all'] }));
  }
  if (roleVals.length > 0) {
    cards.push(makeCard({ rule_id: 'live-labels-role-enum', class: 'enum-drift',
      statement: 'Live GitHub label set defines the allowed role:* values.',
      source: 'gh:label-list', enum_values: roleVals, severity: 'hard-mandatory',
      cross_runtime_applicability: ['all'] }));
  }
  if (laneVals.length > 0) {
    cards.push(makeCard({ rule_id: 'live-labels-lane-enum', class: 'enum-drift',
      statement: 'Live GitHub label set defines the allowed lane:* values.',
      source: 'gh:label-list', enum_values: laneVals, severity: 'hard-mandatory',
      cross_runtime_applicability: ['all'] }));
  }
  return cards;
}

function extractFromLabels() {
  try {
    const out = cp.execFileSync(
      'gh', ['label', 'list', '--json', 'name', '--limit', String(GH_LABEL_LIMIT)],
      { stdio: ['pipe', 'pipe', 'pipe'], timeout: GH_TIMEOUT_MS });
    const labels = JSON.parse(out.toString()).map(l => l.name);
    return labels.length === 0 ? [] : labelsToCards(labels);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// extractAll — walks harness file tree, unions all adapter outputs
// ---------------------------------------------------------------------------
function globSync(dir, ext, maxDepth) {
  const results = [];
  function recurse(cur, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) recurse(full, depth + 1);
      else if (entry.name.endsWith(ext)) results.push(full);
    }
  }
  recurse(dir, 0);
  return results;
}

function collectAdapter(files, fn, cards) {
  for (const filePath of files) {
    try { cards.push(...fn(filePath)); } catch { /* skip unreadable */ }
  }
}

function collectFromTree(rootDir, cards) {
  collectAdapter(
    globSync(path.join(rootDir, 'instructions'), '.md', 1),
    extractFromInstructions, cards);
  const templateFiles = [
    path.join(rootDir, '.github', 'PULL_REQUEST_TEMPLATE.md'),
    ...globSync(path.join(rootDir, '.github', 'ISSUE_TEMPLATE'), '.md', 1),
  ].filter(fp => fs.existsSync(fp));
  collectAdapter(templateFiles, extractFromTemplate, cards);
  collectAdapter(
    globSync(path.join(rootDir, '.github', 'workflows'), '.yml', 1),
    extractFromWorkflow, cards);
  collectAdapter(
    globSync(path.join(rootDir, 'scripts', 'global', 'megalint'), '.js', 1),
    extractFromValidator, cards);
  collectAdapter(
    globSync(path.join(rootDir, 'scripts', 'global'), '.js', 0),
    extractFromValidator, cards);
  collectAdapter(
    globSync(path.join(rootDir, 'hooks', 'scripts'), '.py', 1),
    extractFromHook, cards);
  const lefthook = path.join(rootDir, 'lefthook.yml');
  if (fs.existsSync(lefthook)) {
    try { cards.push(...extractFromPrecommit(lefthook)); } catch { /* skip */ }
  }
  collectAdapter(
    globSync(path.join(rootDir, 'config'), '.json', 1)
      .filter(fp => fp.endsWith('.schema.json')),
    extractFromConfigSchema, cards);
}

function extractAll(opts) {
  const rootDir = (opts && opts.root) || ROOT;
  const cards = [];
  collectFromTree(rootDir, cards);
  cards.push(...extractFromLabels());
  return cards;
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--all')) {
    const cards = extractAll();
    process.stdout.write(JSON.stringify(cards, null, 2) + '\n');
  } else {
    console.error('Usage: node rule-card-extractor.js --all');
    process.exit(1);
  }
}

module.exports = {
  extractFromInstructions, extractFromTemplate, extractFromWorkflow,
  extractFromValidator, extractFromHook, extractFromPrecommit,
  extractFromConfigSchema, extractFromLabels, extractAll,
  VALID_CLASSES, VALID_SEVERITIES, makeCard,
};
