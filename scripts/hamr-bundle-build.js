#!/usr/bin/env node
// hamr-bundle-build.js — content-addressed HAMR bundle generator (#912).
// Wave 2 ships governance-30kb tier; full tier set in Wave 4 child 7.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.resolve(ROOT, 'dist/bundles');
const TIERS = {
  'governance-30kb': {
    sources: ['instructions/'],
    extras: ['wiki/wisdom/global/concepts/baton-signing.md', 'wiki/wisdom/global/concepts/judge-quorum.md', 'wiki/wisdom/global/concepts/hamr-doctor.md', 'wiki/wisdom/global/concepts/hamr-core-worker.md'],
  },
};

function readTreeSorted(rootRel) {
  const abs = path.resolve(ROOT, rootRel);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [{ rel: rootRel, content: fs.readFileSync(abs, 'utf8') }];
  const entries = [];
  for (const name of fs.readdirSync(abs).sort()) {
    if (name.startsWith('.')) continue;
    entries.push(...readTreeSorted(path.join(rootRel, name)));
  }
  return entries;
}

function buildTier(tier, spec) {
  const parts = [];
  for (const src of spec.sources) parts.push(...readTreeSorted(src));
  for (const extra of (spec.extras || [])) parts.push(...readTreeSorted(extra));
  // Canonical concat: NUL-separated paths + payloads, deterministic ordering.
  const canonical = parts.map((p) => `${p.rel}\0${p.content}`).join('\0');
  const sha256 = crypto.createHash('sha256').update(canonical).digest('hex');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${tier}-${sha256.slice(0, 16)}.tar.zst`);
  // Use tar+zstd for the artifact; deterministic filename via SHA prefix.
  const tarManifest = parts.map((p) => `${p.rel}\n${p.content.length}`).join('\n---\n');
  fs.writeFileSync(outFile.replace('.tar.zst', '.json'), JSON.stringify({
    schema_version: 1, tier, sha256, files: parts.length, total_chars: canonical.length,
    file_list: parts.map((p) => p.rel),
  }, null, 2));
  // Tar + zstd via subprocess (skip if binaries missing — emits manifest only).
  try {
    execSync(`cd ${ROOT} && tar -cf ${outFile.replace('.zst', '')} ${parts.map((p) => p.rel).join(' ')} 2>/dev/null`);
    if (fs.existsSync(outFile.replace('.zst', ''))) {
      try { execSync(`zstd --rm ${outFile.replace('.zst', '')} -o ${outFile} 2>/dev/null`); } catch { /* keep .tar */ }
    }
  } catch { /* tar/zstd unavailable; manifest is canonical artifact for SHA */ }
  return { tier, sha256, outFile, files: parts.length };
}

function main() {
  const tier = process.argv[2] || 'governance-30kb';
  if (!TIERS[tier]) { console.error(`unknown tier: ${tier}`); process.exit(1); }
  const result = buildTier(tier, TIERS[tier]);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();
module.exports = { buildTier, readTreeSorted, TIERS };
