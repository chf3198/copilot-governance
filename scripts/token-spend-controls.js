#!/usr/bin/env node
'use strict';
const { compressAllTiers } = require('./constitution-compressor');

const MAX_CHARS = { free: 1600, fleet: 2400, haiku: 4000, premium: 8000 };
const TIER_BY_LANE = { free: 'fim-5kb', fleet: 'routing-12kb', haiku: 'governance-30kb', premium: 'governance-30kb' };

function dedupeLines(text) {
  const seen = new Set();
  let dupes = 0;
  const out = String(text || '').split('\n').filter(line => {
    const key = line.trim();
    if (!key) return true;
    if (seen.has(key)) { dupes += 1; return false; }
    seen.add(key);
    return true;
  });
  return { text: out.join('\n').trim(), duplicateLines: dupes };
}

function compactPrompt(prompt, lane = 'free') {
  const raw = String(prompt || '');
  const deduped = dedupeLines(raw);
  const max = MAX_CHARS[lane] || MAX_CHARS.free;
  const scoped = deduped.text.slice(0, max);
  return {
    prompt: scoped,
    stats: {
      rawChars: raw.length,
      dedupedChars: deduped.text.length,
      sentChars: scoped.length,
      duplicateLines: deduped.duplicateLines,
    },
  };
}

function scopeContext(lane = 'free') {
  const tier = TIER_BY_LANE[lane] || TIER_BY_LANE.free;
  const tierContext = compressAllTiers()[tier];
  return { tier, sha256: tierContext.sha256, files: tierContext.files, chars: tierContext.compressed_chars };
}

module.exports = { compactPrompt, scopeContext, dedupeLines, MAX_CHARS, TIER_BY_LANE };
