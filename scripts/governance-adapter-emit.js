#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { validate } = require('./governance-manifest-validate');

const root = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(root, 'inventory', 'governance-manifest.sample.json');
const defaultOutRoot = path.join(root, 'generated', 'governance-adapters');
const targets = ['copilot', 'cline', 'claude-code', 'continue', 'antigravity', 'cursor'];

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${content}\n`); }
function yamlList(items) { return items.map(item => `  - ${JSON.stringify(item)}`).join('\n'); }
function provenance(target, unit) {
  return [
    '---',
    `target: ${target}`,
    `id: ${unit.id}`,
    `title: ${unit.title}`,
    `priority: ${unit.priority}`,
    `bodyRef: ${unit.bodyRef}`,
    `appliesTo:`,
    yamlList(unit.appliesTo),
    `targets:`,
    yamlList(unit.targets),
    '---',
  ].join('\n');
}
function targetPath(target, unit, outRoot = defaultOutRoot) {
  const base = path.join(outRoot, target);
  if (target === 'copilot') return path.join(base, '.github', 'instructions', `${unit.id}.instructions.md`);
  if (target === 'cline') return path.join(base, '.clinerules', `${unit.id}.md`);
  if (target === 'claude-code') return path.join(base, 'CLAUDE.md');
  if (target === 'continue') return path.join(base, '.continue', 'rules', `${unit.id}.md`);
  if (target === 'antigravity') return path.join(base, '.antigravity', `${unit.id}.md`);
  if (target === 'cursor') return path.join(base, '.cursor', 'rules', `${unit.id}.mdc`);
  throw new Error(`unsupported target: ${target}`);
}
function frontmatter(target, unit) {
  const lines = ['---'];
  if (target === 'cursor') {
    // Cursor .mdc rules use native frontmatter keys (description/globs/alwaysApply).
    lines.push(`description: Governance unit ${unit.id}`);
    lines.push('alwaysApply: true');
    lines.push(`priority: ${unit.priority}`);
    lines.push(`targets: ${JSON.stringify(unit.targets.join(','))}`);
    lines.push('---');
    return lines.join('\n');
  }
  if (target === 'claude-code') {
    lines.push(`description: Governance unit ${unit.id}`);
    lines.push(`applyTo: ${JSON.stringify(unit.appliesTo[0] || '**')}`);
  } else {
    lines.push(`applyTo: ${JSON.stringify(unit.appliesTo[0] || '**')}`);
    lines.push(`paths:`);
    lines.push(yamlList(unit.appliesTo));
  }
  lines.push(`priority: ${unit.priority}`);
  lines.push(`targets: ${JSON.stringify(unit.targets.join(','))}`);
  lines.push('---');
  return lines.join('\n');
}
function body(target, unit) {
  return [
    provenance(target, unit),
    frontmatter(target, unit),
    `# ${unit.title}`,
    '',
    `Source: ${unit.bodyRef}`,
    `Targets: ${unit.targets.join(', ')}`,
    '',
    `This is a generated adapter preview for ${target}.`,
  ].join('\n');
}
function emit(manifestFile = manifestPath, outRoot = defaultOutRoot) {
  const manifest = readJson(manifestFile);
  const errors = validate(manifest);
  if (errors.length) throw new Error(errors.join('; '));
  const outputs = [];
  for (const target of targets) {
    for (const unit of manifest.units) {
      if (!unit.targets.includes(target)) continue;
      const file = targetPath(target, unit, outRoot);
      const content = body(target, unit);
      write(file, content);
      outputs.push(file);
    }
  }
  return outputs;
}
function main() {
  try {
    const outputs = emit();
    process.stdout.write(outputs.map(o => path.relative(root, o)).join('\n') + '\n');
  } catch (e) {
    process.stderr.write(`governance-adapter-emit: ${e.message}\n`);
    process.exit(2);
  }
}
module.exports = { emit, targetPath, provenance, frontmatter, body };
if (require.main === module) main();
