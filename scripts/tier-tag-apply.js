#!/usr/bin/env node
'use strict';
// tier: 1
// tier-tag-apply (Epic #2398 AC3): idempotent tagger. Inserts a `// tier: N` comment
// into any scripts/global/*.js that references a tier>=2 resource and lacks a tag,
// where N is the tier the resources imply (per tier-tag-lint heuristics). Re-runnable;
// skips already-tagged files. Untagged scripts remain the documented tier-1 baseline.

const fs = require('node:fs');
const path = require('node:path');
const { impliedTier, TAG_RE } = require('./megalint/tier-tag-lint');

function insertTag(content, tier) {
  const lines = content.split('\n');
  let at = 0;
  if (lines[0] && lines[0].startsWith('#!')) at = 1;
  if (lines[at] && /^['"]use strict['"];?\s*$/.test(lines[at])) at += 1;
  lines.splice(at, 0, `// tier: ${tier}`);
  return lines.join('\n');
}

function apply(root) {
  const dir = path.join(root, 'scripts', 'global');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const tagged = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    if (TAG_RE.test(content)) continue;
    const tier = impliedTier(content);
    if (tier < 2) continue; // tier-0/1 baseline stays untagged
    fs.writeFileSync(filePath, insertTag(content, tier), 'utf8');
    tagged.push({ file, tier });
  }
  return tagged;
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..', '..');
  const tagged = apply(root);
  console.log(`tier-tag-apply: tagged ${tagged.length} script(s).`);
  for (const tag of tagged) console.log(`  ${tag.file} → tier ${tag.tier}`);
}

module.exports = { apply, insertTag };
