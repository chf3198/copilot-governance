#!/usr/bin/env node
// Guard: disallow sync child_process calls in dashboard HTTP handlers
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TARGET_FILES = [
  'scripts/dashboard-server.js',
  'scripts/dashboard-api-handlers.js',
  'scripts/global/dashboard-api.js',
  'scripts/global/dashboard-serve.js',
];
const PROHIBITED_PATTERN = /\b(execSync|spawnSync)\s*\(/g;

function resolveTargetPath(relativePath) {
  return path.join(ROOT, relativePath);
}

function findViolations(relativePath) {
  const absolutePath = resolveTargetPath(relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [{ relativePath, lineNumber: 0, matchText: 'missing file' }];
  }
  const fileText = fs.readFileSync(absolutePath, 'utf8');
  const fileLines = fileText.split('\n');
  const violations = [];
  for (let lineIndex = 0; lineIndex < fileLines.length; lineIndex += 1) {
    const currentLine = fileLines[lineIndex];
    const regex = new RegExp(PROHIBITED_PATTERN.source, 'g');
    const match = regex.exec(currentLine);
    if (!match) continue;
    violations.push({
      relativePath,
      lineNumber: lineIndex + 1,
      matchText: match[1],
    });
  }
  return violations;
}

function main() {
  const allViolations = TARGET_FILES.flatMap(findViolations)
    .filter(item => item.matchText !== 'missing file');
  if (allViolations.length === 0) {
    console.log('no-sync-http-handlers: PASS');
    process.exit(0);
  }
  console.error('no-sync-http-handlers: FAIL');
  allViolations.forEach(item => {
    console.error(`- ${item.relativePath}:${item.lineNumber} uses ${item.matchText}()`);
  });
  process.exit(1);
}

main();
