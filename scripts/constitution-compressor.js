#!/usr/bin/env node
// constitution-compressor.js — HAMR Wave 4 child 7 (#925).
// Deterministic top-k extractive compressor + tier-aware bundle gen per v3.2 §R6.
// Replaces LLMLingua-2 production path with deterministic Stage-1 (S5 #880 finding).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const KEYWORD_FILE = path.join(ROOT, 'inventory', 'governance-keywords.json');

const KB = 1000;
const TIER_FIM = 5 * KB;
const TIER_ROUTING = 12 * KB;
const TIER_GOVERNANCE = 30 * KB;
const TIER_ARCHITECT = 90 * KB;
const SHORT_LINE_MAX = 200;

const TIERS = {
  'fim-5kb': { target_chars: TIER_FIM, sources: ['instructions/role-baton-routing.instructions.md'], extras: [] },
  'routing-12kb': { target_chars: TIER_ROUTING, sources: ['instructions/role-baton-routing.instructions.md', 'instructions/global-task-router.instructions.md', 'instructions/ticket-driven-work.instructions.md'], extras: [] },
  'governance-30kb': { target_chars: TIER_GOVERNANCE, sources: ['instructions/'], extras: ['wiki/wisdom/global/concepts/baton-signing.md', 'wiki/wisdom/global/concepts/judge-quorum.md', 'wiki/wisdom/global/concepts/hamr-doctor.md', 'wiki/wisdom/global/concepts/hamr-core-worker.md'] },
  'architect-90kb': { target_chars: TIER_ARCHITECT, sources: ['instructions/', 'wiki/wisdom/global/concepts/'], extras: [] },
};

const DEFAULT_KEYWORDS = [
  'MANAGER_HANDOFF', 'COLLABORATOR_HANDOFF', 'ADMIN_HANDOFF', 'CONSULTANT_CLOSEOUT',
  'role:manager', 'role:collaborator', 'role:admin', 'role:consultant',
  'status:backlog', 'status:triage', 'status:ready', 'status:in-progress', 'status:testing', 'status:review', 'status:done',
  'lane:code-change', 'lane:docs-research', 'lane:config-only', 'lane:no-code-remediation',
  'Refs #', 'BLOCKER_NOTE', 'evidence-completeness', 'baton-gates',
  'Conventional Commits', 'GITHUB_TOKEN', 'AI-Signature', 'AI-Team-Model', 'AI-Role',
  'visual_qa', 'pr-title-required', 'collaborator-gate', 'admin-gate', 'consultant-gate',
];

function loadKeywords() {
  if (!fs.existsSync(KEYWORD_FILE)) return DEFAULT_KEYWORDS;
  try { return JSON.parse(fs.readFileSync(KEYWORD_FILE, 'utf8')).keywords ?? DEFAULT_KEYWORDS; }
  catch { return DEFAULT_KEYWORDS; }
}

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

function scoreLine(line, keywords) {
  let score = 0;
  for (const kw of keywords) if (line.includes(kw)) score += 10;
  if (/^#{1,4}\s/.test(line)) score += 5; // headings
  if (/^\s*[-*+]\s/.test(line)) score += 2; // bullets
  if (line.length > 0 && line.length < SHORT_LINE_MAX) score += 1;
  return score;
}

function compressFile(file, keywords, targetChars) {
  const lines = file.content.split('\n').map((line, i) => ({ line, i, score: scoreLine(line, keywords) }));
  // Greedy: keep highest-scoring lines until under budget; preserve original order.
  const ranked = [...lines].sort((a, b) => b.score - a.score || a.i - b.i);
  const kept = new Set();
  let totalChars = 0;
  for (const entry of ranked) {
    const cost = entry.line.length + 1;
    if (totalChars + cost > targetChars) break;
    kept.add(entry.i);
    totalChars += cost;
  }
  return { rel: file.rel, content: lines.filter((l) => kept.has(l.i)).map((l) => l.line).join('\n') };
}

function buildTier(tierName, spec, keywords) {
  const parts = [];
  for (const src of spec.sources) parts.push(...readTreeSorted(src));
  for (const extra of (spec.extras || [])) parts.push(...readTreeSorted(extra));
  const totalRaw = parts.reduce((sum, p) => sum + p.content.length, 0);
  const perFileBudget = Math.floor(spec.target_chars / Math.max(parts.length, 1));
  const compressed = parts.map((p) => compressFile(p, keywords, perFileBudget));
  const canonical = compressed.map((p) => `${p.rel}\0${p.content}`).join('\0');
  const sha256 = crypto.createHash('sha256').update(canonical).digest('hex');
  const compressedChars = canonical.length;
  return {
    tier: tierName,
    sha256,
    files: compressed.length,
    raw_chars: totalRaw,
    compressed_chars: compressedChars,
    compression_ratio: (compressedChars / totalRaw).toFixed(3),
    compressed_files: compressed,
  };
}

function compressAllTiers() {
  const keywords = loadKeywords();
  return Object.fromEntries(Object.entries(TIERS).map(([name, spec]) => [name, buildTier(name, spec, keywords)]));
}

if (require.main === module) {
  const tier = process.argv[2];
  const all = compressAllTiers();
  console.log(JSON.stringify(tier ? all[tier] : Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { tier: v.tier, sha256: v.sha256, files: v.files, raw_chars: v.raw_chars, compressed_chars: v.compressed_chars, compression_ratio: v.compression_ratio }])), null, 2));
}

module.exports = { compressAllTiers, buildTier, compressFile, scoreLine, loadKeywords, TIERS, DEFAULT_KEYWORDS };
