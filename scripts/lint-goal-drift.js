#!/usr/bin/env node
'use strict';
/* lint-goal-drift — detect priority-sentence drift across the 6 goal-bearing
 * surfaces. Per #1122 / #1105 D-011. Compares each mirror surface against
 * the canonical priority sentence in instructions/harness-goals.instructions.md
 * (or generated/goals-contract.json after #1121 ships).
 *
 * Advisory-first: emits warnings to stderr but exits 0 by default.
 * Set GOAL_DRIFT_GATE=1 to make it a hard gate (exits 1 on drift).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const ADVISORY = !process.env.GOAL_DRIFT_GATE;

// Load canonical priority order from generated JSON contract (#1121)
function loadCanonical() {
  const contractPath = path.join(ROOT, 'generated/goals-contract.json');
  if (fs.existsSync(contractPath)) {
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    return contract.priority_order.map((goal) => `${goal.id} ${goal.name}`);
  }
  // Fallback: parse from instructions if JSON not regenerated yet
  const md = fs.readFileSync(path.join(ROOT, 'instructions/harness-goals.instructions.md'), 'utf8');
  const flat = md.replace(/\s+/g, ' ');
  const tokens = [...flat.matchAll(/(G[1-9])\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)\s*(?=[>.])/g)];
  const seen = new Set();
  const out = [];
  for (const tok of tokens) {
    if (out.length === 9) break;
    if (!seen.has(tok[1])) { seen.add(tok[1]); out.push(`${tok[1]} ${tok[2].trim()}`); }
  }
  return out;
}

const SURFACES = [
  { path: 'instructions/global-standards.instructions.md', form: 'g-prefix' },
  { path: 'hooks/scripts/goal_lens.py', form: 'g-prefix' },
  { path: '.codex/AGENTS.md', form: 'plain' },
  { path: '.github/copilot-instructions.md', form: 'plain' },
  { path: 'wiki/wisdom/global/concepts/harness-goals.md', form: 'numbered' },
];

function findChain(text, form) {
  const flat = text.replace(/\s+/g, ' ');
  if (form === 'g-prefix') {
    // Accept token followed by `>`, `.`, end-of-quote, or end-of-string
    const tokens = [...flat.matchAll(/(G[1-9])\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)/g)];
    const seen = new Set();
    const out = [];
    for (const tok of tokens) {
      if (out.length === 9) break;
      if (!seen.has(tok[1])) { seen.add(tok[1]); out.push(`${tok[1]} ${tok[2].trim()}`); }
    }
    return out;
  }
  if (form === 'numbered') {
    // Numbered list: "1. Governance\n2. Quality..."
    const out = [];
    for (let i = 1; i <= 9; i += 1) {
      const match = flat.match(new RegExp(`(?:^|\\s)${i}\\.\\s+([A-Z][A-Za-z]+(?:\\s[A-Z][A-Za-z]+)?)`));
      if (match) out.push(match[1].trim());
    }
    return out;
  }
  // plain: "Governance > Quality > Zero Cost > ... > Interoperability"
  const match = flat.match(/Governance\s*[>,.]\s*Quality\s*[>,.]\s*Zero\s+Cost[\s\S]*?Interoperability/);
  if (!match) return [];
  return match[0].split(/\s*[>,.]\s*/).map((str) => str.trim()).filter(Boolean).slice(0, 9);
}

function main() {
  const canonical = loadCanonical();
  const canonicalNames = canonical.map((str) => str.replace(/^G[1-9]\s+/, ''));
  let drift = 0;
  for (const surface of SURFACES) {
    const fp = path.join(ROOT, surface.path);
    if (!fs.existsSync(fp)) { console.warn(`SKIP ${surface.path}: not found`); continue; }
    const text = fs.readFileSync(fp, 'utf8');
    const found = findChain(text, surface.form);
    const foundNames = found.map((x) => x.replace(/^G[1-9]\s+/, ''));
    const ok = foundNames.length === 9 && foundNames.every((name, idx) => name === canonicalNames[idx]);
    if (ok) console.log(`OK   ${surface.path} (${surface.form})`);
    else { drift += 1; console.warn(`DRIFT ${surface.path} (${surface.form}): found=${found.join(' > ')}`); }
  }
  if (drift) {
    const tag = ADVISORY ? 'ADVISORY' : 'GATE';
    console.warn(`\n${tag}: ${drift} surface(s) drift from canonical priority sentence.`);
    if (!ADVISORY) process.exit(1);
  } else {
    console.log('\n✅ No drift detected across 5 mirror surfaces.');
  }
}

if (require.main === module) main();
module.exports = { loadCanonical, findChain };
