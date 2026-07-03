#!/usr/bin/env node
'use strict';
// #2304 -- single source of truth for Conventional Commits type enum.
// Consumed by validate-branch-name.sh (CI guard test asserts parity),
// .github/workflows/pr-title.yml (updated to match), and
// instructions/github-governance.instructions.md (updated to match).
// Adding a new type here requires updating all three surfaces.

const CONVENTIONAL_COMMIT_TYPES = [
  'feat',
  'fix',
  'chore',
  'content',
  'perf',
  'refactor',
  'docs',
  'style',
  'test',
  'skill',
  'hotfix',
];

// Regex alternation string -- suitable for use in grep -E or RegExp constructor.
// Example: "^(feat|fix|chore|...)/<rest>"
const regexPattern = `(${CONVENTIONAL_COMMIT_TYPES.join('|')})`;

// Full branch-prefix regex -- matches <type>/<slug> where slug is lowercase alnum+dash.
const branchPrefixRegex = new RegExp(
  `^${regexPattern}/[a-z0-9][-a-z0-9]*$`
);

// PR title regex -- matches type(optional-scope): subject
const prTitleRegex = new RegExp(
  `^${regexPattern}(\\([^)]+\\))?!?:\\s.+`
);

module.exports = {
  CONVENTIONAL_COMMIT_TYPES,
  regexPattern,
  branchPrefixRegex,
  prTitleRegex,
};
