#!/usr/bin/env node
// synthesis-prompt-render — render a template from scripts/global/synthesis-prompts/
// with {{placeholder}} substitution. Refs #1112 AC3 (#2404).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE_DIR = path.join(__dirname, 'synthesis-prompts');
const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

function renderPrompt(name, vars) {
  if (!name || typeof name !== 'string') {
    throw new Error('renderPrompt: name required');
  }
  if (!vars || typeof vars !== 'object') {
    throw new Error('renderPrompt: vars object required');
  }
  const templatePath = path.join(TEMPLATE_DIR, `${name}.md`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`renderPrompt: template not found: ${name}.md`);
  }
  const src = fs.readFileSync(templatePath, 'utf8');
  const missing = [];
  const rendered = src.replace(PLACEHOLDER_RE, (_, key) => {
    if (!(key in vars)) { missing.push(key); return `{{${key}}}`; }
    return String(vars[key]);
  });
  if (missing.length > 0) {
    throw new Error(`renderPrompt: missing required vars: ${[...new Set(missing)].join(', ')}`);
  }
  return rendered;
}

if (require.main === module) {
  const [, , name, ...rest] = process.argv;
  const vars = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i]?.startsWith('--')) vars[rest[i].slice(2)] = rest[i + 1];
  }
  try { process.stdout.write(renderPrompt(name, vars)); }
  catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { renderPrompt, TEMPLATE_DIR };
