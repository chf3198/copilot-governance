#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function extractIssueNum(text) {
  const match = text.match(/#(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function extractFromBranch(branch) {
  const match = branch.match(/^#?(\d+)-/);
  return match ? parseInt(match[1], 10) : null;
}

function validateLinkage(branch, commitMsg) {
  const branchIssue = extractFromBranch(branch);
  const commitIssue = extractIssueNum(commitMsg);

  if (!branchIssue)
    return { ok: false, reason: 'branch must start with #123-' };
  if (!commitIssue)
    return { ok: false, reason: 'commit must reference closes #123' };
  if (branchIssue !== commitIssue)
    return {
      ok: false,
      reason: `branch #${branchIssue} != commit #${commitIssue}`
    };
  return { ok: true, reason: 'linkage valid', issueNum: branchIssue };
}

module.exports = { extractIssueNum, extractFromBranch, validateLinkage };
