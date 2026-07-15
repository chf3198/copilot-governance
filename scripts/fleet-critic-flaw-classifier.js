// tier: 3
// Structured-tag flaw classifier for the cross-family critic (#2888 follow-on of #2797). Upgrades the
// keyword-only heuristic (now the documented FALLBACK): it parses machine-readable tags the critic appends
// to a finding line — "[tags: security,correctness] [severity: high]" — FIRST, so a real flaw phrased
// without flaw-vocabulary is still classified when the critic tagged it; when no tags are present it falls
// back to #2797's keyword defaultClassify. Wired as the critic's deps.classifyFlaw (a `(text)->{flaw,
// highSeverity}` fn). Pure; bounded parsing of untrusted critic text. One-way dep on the critic (no cycle).
'use strict';
const { defaultClassify } = require('./fleet-cross-family-critic');

// Tag classes that constitute a merge-blocking flaw (perf alone is advisory, matching #2797's carve-out).
const FLAW_TAGS = new Set(['security', 'correctness', 'concurrency', 'merge-safety']);
// Tag classes that, absent an explicit severity, imply high-stakes (→ escalate-when-unprovable in #2797).
const HIGH_SEV_TAGS = new Set(['security', 'correctness']);
const MAX_FINDING_LEN = 4000; // cap untrusted critic text (bounds work; a real finding line is far shorter)
const TAGS_RE = /\[tags:\s*([a-z0-9_,\s-]+)\]/gi; // GLOBAL — collect tags from EVERY block, no length micro-cap
const SEVERITY_RE = /\[severity:\s*(high|medium|low)\s*\]/gi; // GLOBAL — consider EVERY severity block

// Parse [tags: ...] [severity: ...] from a finding line — merging tags from ALL [tags:] blocks (a flaw tag
// in a later block can't be missed) and taking the HIGHEST severity across ALL [severity:] blocks (a later
// 'low' can't downgrade an earlier 'high', or vice-versa). Tag names have internal whitespace folded to '-'
// so "merge safety" matches the canonical "merge-safety". null when NEITHER annotation is present (→ caller
// falls back to the keyword classifier). Input length-capped (bounded work); lower-cased; own-data only.
function parseTags(text) {
  const safe = (typeof text === 'string' ? text : '').slice(0, MAX_FINDING_LEN);
  const tags = new Set();
  for (const match of safe.matchAll(TAGS_RE)) {
    for (const tag of match[1].split(',')) { const cleaned = tag.trim().toLowerCase().replace(/\s+/g, '-'); if (cleaned) tags.add(cleaned); }
  }
  const severities = [...safe.matchAll(SEVERITY_RE)].map((match) => match[1].toLowerCase());
  const severity = severities.includes('high') ? 'high' : severities.includes('medium') ? 'medium' : severities.includes('low') ? 'low' : null;
  if (tags.size === 0 && severity === null) return null;
  return { tags, severity };
}

// Classify from parsed tags: flaw iff a flaw-class tag is present OR the critic declared severity:high (a
// HIGH-severity finding is a flaw even if its tag is unrecognized/typo'd — fail-safe; a misspelled tag must
// not downgrade a high-severity finding). high-severity iff flaw AND (severity:high OR, absent an explicit
// severity, a high-stakes tag). An explicit medium/low severity is respected.
function classifyFromTags(parsed) {
  const flawTag = [...parsed.tags].some((tag) => FLAW_TAGS.has(tag));
  const flaw = flawTag || parsed.severity === 'high';
  const byTag = parsed.severity === null && [...parsed.tags].some((tag) => HIGH_SEV_TAGS.has(tag));
  return { flaw, highSeverity: flaw && (parsed.severity === 'high' || byTag) };
}

// classifyFlaw(text, fallback) -> { flaw, highSeverity, source }. Tags first; keyword fallback (default =
// #2797 defaultClassify) when the critic emitted no tags — correct for tag-unaware/legacy critics, and a
// silent-merge is still prevented because #2797 prove-its EVERY reject keyword-independently regardless of
// this flag (the flag only drives the severity/escalation routing + the PARTIAL carve-out). `source` (G8)
// records which path classified.
function classifyFlaw(text, fallback = defaultClassify) {
  const parsed = parseTags(typeof text === 'string' ? text : '');
  if (parsed) return { ...classifyFromTags(parsed), source: 'tags' };
  return { ...fallback(text), source: 'keyword' };
}

module.exports = { parseTags, classifyFromTags, classifyFlaw, FLAW_TAGS, HIGH_SEV_TAGS };
