#!/usr/bin/env node
'use strict';
/* Generate JSON contract from instructions/harness-goals.instructions.md
 * Per #1121 / #1105 D-007. Markdown is canonical source; JSON is derived
 * view for programmatic linting (#1122) and machine-readable tools.
 * Updated: support G10+, & in names, multi-line definitions (#1529-#1531).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCE = path.resolve(
  __dirname, '../../instructions/harness-goals.instructions.md'
);
const OUT = path.resolve(__dirname, '../../generated/goals-contract.json');

// Name token: one or more Title-cased words optionally joined with &/and
const NAME_PAT = '[A-Z][A-Za-z]+(?:[\\s&]+[A-Z][A-Za-z]+)*';

function parse(md) {
  const priority = [];
  const definitions = {};
  const flat = md.replace(/\s+/g, ' ');
  // Extract G<n> Name from priority line (supports G10+)
  const prioRe = new RegExp(`(G\\d+)\\s+(${NAME_PAT})\\s*(?=[>.]?)`, 'g');
  for (const tokenMatch of flat.matchAll(prioRe)) {
    if (!priority.find((p) => p.id === tokenMatch[1])) {
      priority.push({ id: tokenMatch[1], name: tokenMatch[2].trim() });
    }
  }
  // Definitions from `- G<n> Name: text` bullets; join continuation lines
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const dm = lines[i].match(
      new RegExp(`^- (G\\d+)\\s+(${NAME_PAT}):\\s+(.+?)(?:\\.)?\\s*$`)
    );
    if (!dm) continue;
    let text = dm[3].trim();
    while (lines[i + 1] && lines[i + 1].startsWith('  ')) {
      text += ' ' + lines[++i].trim().replace(/\.$/, '');
    }
    definitions[dm[1]] = { name: dm[2].trim(), text };
  }
  return { priority, definitions };
}

function main() {
  const md = fs.readFileSync(SOURCE, 'utf8');
  const sourceSha = crypto.createHash('sha256').update(md).digest('hex').slice(0, 16);
  const { priority, definitions } = parse(md);
  const contract = {
    schema_version: 1,
    generated_utc: new Date().toISOString(),
    source_path: 'instructions/harness-goals.instructions.md',
    source_sha256_prefix: sourceSha,
    priority_order: priority,
    definitions,
    notes: [
      'GENERATED — do not edit. Regenerate via `npm run goals:regen`.',
      'Markdown source is canonical; JSON is a derived view for linting/automation.',
      'Direct edits to this file are blocked by CI (verify-goals-contract gate).',
    ],
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(contract, null, 2) + '\n');
  console.log(`✅ goals-contract written: ${OUT} (${priority.length} goals)`);
}

if (require.main === module) main();
module.exports = { parse };
