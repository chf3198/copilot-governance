'use strict';

function extractTeamModelFromText(text = '') {
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(?:Team&Model|AI-Team-Model):\s*(.+)$/i);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

function resolveParallelIdentity(record = {}) {
  const bodyIdentity = extractTeamModelFromText(record.body || '');
  if (bodyIdentity) return { source: 'team-model', value: bodyIdentity };
  for (const commit of Array.isArray(record.commits) ? record.commits : []) {
    const message = commit?.commit?.message || '';
    const commitIdentity = extractTeamModelFromText(message);
    if (commitIdentity) return { source: 'team-model', value: commitIdentity };
  }
  return { source: 'login', value: record.user?.login || 'unknown' };
}

function isParallelPair(left, right) {
  return resolveParallelIdentity(left).value !== resolveParallelIdentity(right).value;
}

module.exports = {
  extractTeamModelFromText,
  resolveParallelIdentity,
  isParallelPair,
};
