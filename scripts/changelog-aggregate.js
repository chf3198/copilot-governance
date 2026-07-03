#!/usr/bin/env node
// changelog-aggregate.js — Aggregate .changes/unreleased/*.md fragments into
// CHANGELOG.md. Eliminates merge-conflict surface on the shared CHANGELOG by
// having each PR write one isolated fragment file. Epic #1132. Refit #2126
// adds T3/T4 fragment validation + Keep-a-Changelog-aware [Unreleased] splice
// per Phase-0 synthesis at wiki/wisdom/project/research/changelog-aggregator-2120.md.
//
// Usage: node scripts/global/changelog-aggregate.js [--dry-run] [--archive-to <dir>] [--validate-only]
'use strict';

const fs = require('fs');
const path = require('path');
const validator = require('./changelog-fragment-validator');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRAGMENTS_DIR = path.join(REPO_ROOT, '.changes', 'unreleased');
const CHANGELOG = path.join(REPO_ROOT, 'CHANGELOG.md');
const CHANGELOG_HEADER = '# Changelog';
const UNRELEASED_RE = /^## \[Unreleased\]\s*$/m;

function listFragments(dir = FRAGMENTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => n.endsWith('.md'))
    .map(n => ({ name: n, path: path.join(dir, n) }))
    .sort((a, b) => {
      const aNum = parseInt(a.name, 10), bNum = parseInt(b.name, 10);
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
      return a.name.localeCompare(b.name);
    });
}

function readFragment(fragment) { return fs.readFileSync(fragment.path, 'utf-8').trim(); }

function buildAggregatedSection(fragments) {
  if (fragments.length === 0) return '';
  const blocks = fragments.map(readFragment).filter(b => b.length > 0);
  return blocks.join('\n\n') + '\n\n';
}

function spliceIntoChangelog(aggregated, changelogPath = CHANGELOG) {
  const current = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : CHANGELOG_HEADER + '\n\n';
  if (!current.startsWith(CHANGELOG_HEADER) && !current.startsWith('<!--')) {
    throw new Error(`CHANGELOG.md missing header "${CHANGELOG_HEADER}"`);
  }
  if (UNRELEASED_RE.test(current)) {
    // Keep-a-Changelog mode: insert aggregated content immediately after the
    // `## [Unreleased]` line (with a blank line) so each fragment's H3 categories
    // accumulate under the canonical Unreleased section.
    return current.replace(UNRELEASED_RE, m => `${m}\n${aggregated.trimEnd()}`);
  }
  // Legacy fallback: prepend after the title header.
  const headerLen = CHANGELOG_HEADER.length;
  const headerIdx = current.indexOf(CHANGELOG_HEADER);
  if (headerIdx < 0) throw new Error('CHANGELOG.md missing # Changelog header');
  const before = current.slice(0, headerIdx + headerLen);
  const afterHeader = current.slice(headerIdx + headerLen).replace(/^\s*/, '');
  return `${before}\n\n${aggregated}${afterHeader}`;
}

function archiveFragments(fragments, archiveDir) {
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  for (const fragment of fragments) fs.renameSync(fragment.path, path.join(archiveDir, fragment.name));
}

function deleteFragments(fragments) { for (const fragment of fragments) fs.unlinkSync(fragment.path); }

function aggregate(opts = {}) {
  const fragments = listFragments(opts.dir || FRAGMENTS_DIR);
  if (fragments.length === 0) return { count: 0, fragments: [], skipped: 'empty' };
  const validation = validator.validateAll(fragments);
  if (!validation.ok) {
    const err = new Error(`Fragment validation failed:\n  ${validation.violations.join('\n  ')}`);
    err.violations = validation.violations;
    throw err;
  }
  if (opts.validateOnly) return { count: fragments.length, fragments: fragments.map(f => f.name), validateOnly: true };
  const aggregated = buildAggregatedSection(fragments);
  const newChangelog = spliceIntoChangelog(aggregated, opts.changelog || CHANGELOG);
  if (opts.dryRun) return { count: fragments.length, fragments, preview: aggregated, dryRun: true };
  fs.writeFileSync(opts.changelog || CHANGELOG, newChangelog, 'utf-8');
  if (opts.archiveTo) archiveFragments(fragments, opts.archiveTo); else deleteFragments(fragments);
  return { count: fragments.length, fragments: fragments.map(f => f.name) };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const validateOnly = args.includes('--validate-only');
  const archiveIdx = args.indexOf('--archive-to');
  const archiveTo = archiveIdx >= 0 ? args[archiveIdx + 1] : null;
  try {
    const result = aggregate({ dryRun, validateOnly, archiveTo });
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = {
  aggregate, listFragments, buildAggregatedSection, spliceIntoChangelog,
  FRAGMENTS_DIR, CHANGELOG, CHANGELOG_HEADER,
};
