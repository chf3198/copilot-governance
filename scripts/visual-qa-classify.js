#!/usr/bin/env node
// scripts/global/visual-qa-classify.js — Diff-aware visual QA classifier (Epic #1083).
// Classifies a changed-files set as UI-affecting or non-UI; auto-records N/A
// for non-UI diffs to eliminate stop-hook visual_qa false positives.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const UI_PATTERNS = [
  /^dashboard\/.*\.html$/,
  /^dashboard\/css\/.*\.css$/,
  /^dashboard\/js\/.*-panel\.js$/,
  /^dashboard\/js\/.*-view\.js$/,
  /^vscode-extension\/.*\.html$/,
];

const SAFE_NON_UI_PATTERNS = [
  /^scripts\//,
  /^tests\//,
  /^\.github\//,
  /^instructions\//,
  /^research\//,
  /^docs\//,
  /^wiki\//,
  /^CHANGELOG\.md$/,
  /^README\.md$/,
];

function isUiPath(p) {
  return UI_PATTERNS.some(rx => rx.test(p));
}

function isSafeNonUi(p) {
  return SAFE_NON_UI_PATTERNS.some(rx => rx.test(p));
}

function classify(changedFiles) {
  const uiHits = changedFiles.filter(isUiPath);
  if (uiHits.length > 0) {
    return { needed: true, reason: 'ui-files-changed', ui_files: uiHits };
  }
  const unclassified = changedFiles.filter(p => !isSafeNonUi(p) && !isUiPath(p));
  if (unclassified.length > 0) {
    return { needed: 'maybe', reason: 'unclassified-files', files: unclassified,
      auto_record: null, hint: 'manual review needed' };
  }
  return { needed: false, reason: 'no-ui-files-in-diff', auto_record: 'N/A' };
}

function gitChangedFiles(baseRef = 'origin/main') {
  try {
    return execSync(`git diff --name-only ${baseRef}...HEAD 2>/dev/null`, { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
  } catch { return []; }
}

if (require.main === module) {
  const baseRef = process.argv[2] || 'origin/main';
  const files = gitChangedFiles(baseRef);
  const verdict = classify(files);
  console.log(JSON.stringify({ files, verdict }, null, 2));
}

module.exports = { classify, isUiPath, isSafeNonUi, gitChangedFiles,
  UI_PATTERNS, SAFE_NON_UI_PATTERNS };
