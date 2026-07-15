'use strict';
const cp = require('child_process');

const STOPWORDS = new Set(['the', 'and', 'a', 'to', 'of', 'in', 'is', 'for', 'with', 'on', 'this', 'that', 'an', 'as', 'at', 'by', 'it', 'or', 'from']);
const SYNONYMS = {
  'crash': ['failure', 'error', 'exception', 'crashed', 'crashes', 'fail', 'err'],
  'execute': ['spawn', 'run', 'spawned', 'exec', 'execution', 'executing', 'spawnsync', 'spawns'],
  'linter': ['lint', 'checker', 'validator', 'validation', 'gate']
};

function gh(args) {
  return cp.execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

function normalizeToken(token) {
  const t = token.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (STOPWORDS.has(t) || !t) return null;
  for (const [canonical, syns] of Object.entries(SYNONYMS)) {
    if (syns.includes(t) || t === canonical) return canonical;
  }
  return t;
}

function getTokens(text) {
  const raw = String(text || '').split(/\s+/);
  const result = new Set();
  for (const word of raw) {
    const t = normalizeToken(word);
    if (t) result.add(t);
  }
  return result;
}

function lintTicketRedundancy() {
  const raw = gh(['issue', 'list', '--state', 'open', '--limit', '500', '--json', 'number,title,body']);
  const issues = JSON.parse(raw);
  const tokenMap = new Map();
  const invertedIndex = new Map();

  for (const issue of issues) {
    const tokens = getTokens(`${issue.title} ${issue.body}`);
    tokenMap.set(issue.number, tokens);
    for (const token of tokens) {
      if (!invertedIndex.has(token)) invertedIndex.set(token, []);
      invertedIndex.get(token).push(issue.number);
    }
  }

  const overlaps = new Map();
  for (const [token, list] of invertedIndex.entries()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = `${list[i]}-${list[j]}`;
        overlaps.set(key, (overlaps.get(key) || 0) + 1);
      }
    }
  }

  const findings = [];
  for (const [key, count] of overlaps.entries()) {
    if (count < 3) continue;
    const [numA, numB] = key.split('-').map(Number);
    const tokensA = tokenMap.get(numA);
    const tokensB = tokenMap.get(numB);
    const union = new Set([...tokensA, ...tokensB]);
    const intersection = [...tokensA].filter(t => tokensB.has(t));
    const similarity = intersection.length / union.size;

    if (similarity >= 0.70) {
      const issueA = issues.find(i => i.number === numA);
      const issueB = issues.find(i => i.number === numB);
      findings.push({
        pair: [numA, numB],
        similarity,
        message: `Potential redundancy between #${numA} ("${issueA.title}") and #${numB} ("${issueB.title}") (Jaccard similarity: ${similarity.toFixed(2)})`
      });
    }
  }

  return findings;
}

if (require.main === module) {
  try {
    const findings = lintTicketRedundancy();
    if (findings.length) {
      console.error('❌ Ticket Backlog Redundancy/Conflict Detected:');
      findings.forEach(f => console.error(`- ${f.message}`));
      process.exit(1);
    }
    console.log('✅ Ticket Backlog Redundancy Check: PASS');
  } catch (err) {
    console.error('Redundancy check failed:', err.message);
    process.exit(1);
  }
}

module.exports = { lintTicketRedundancy, getTokens, normalizeToken };
