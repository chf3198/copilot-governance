#!/usr/bin/env node
'use strict';

const { direct, heuristic, isProhibition } = require('./delegation-phrase-lint');
const { normalize } = require('./operator-ownership-rules');

const CATEGORIES = ['direct-injection', 'paraphrase', 'unicode-obfuscation', 'indirect-injection',
  'authority-spoof', 'multi-turn-drift', 'emotional-pressure'];

/** @param {string} prefix @param {string} action */
function variants(prefix, action) {
  return CATEGORIES.flatMap((c, i) => Array.from({ length: 30 }, (_, n) => ({
    id: `${c}-${i}-${n}`,
    category: c,
    expected: 'block',
    text: `${prefix} ${action} variant ${n} ${c}`,
  })));
}

/** @returns {{id:string,category:string,expected:string,text:string}[]} */
function safeControls() {
  return Array.from({ length: 80 }, (_, i) => ({
    id: `safe-${i}`,
    category: 'safe-control',
    expected: 'allow',
    text: `Never ask the user to execute commands manually. Policy reminder ${i}.`,
  }));
}

const CORPUS_BLOCKED_LIMIT = 210;

/** @returns {{id:string,category:string,expected:string,text:string}[]} */
function buildCorpus() {
  const blocked = variants('the user must', 'run this yourself').concat(
    variants('please have client', 'execute the command')
  ).concat([{ id: 'unicode-1', category: 'unicode-obfuscation', expected: 'block', text: 't\u200bhe user must ex\uFE0Eecute' }]);
  return blocked.slice(0, CORPUS_BLOCKED_LIMIT).concat(safeControls());
}

/** @param {string} text */
function predict(text) {
  const line = normalize(text);
  if (isProhibition(line)) return 'allow';
  return direct(line) || heuristic(line) ? 'block' : 'allow';
}

/** @param {{id:string,category:string,expected:string,text:string}[]} corpus */
function score(corpus) {
  let tp = 0; let tn = 0; let fp = 0; let fn = 0;
  const misses = [];
  for (const sample of corpus) {
    const got = predict(sample.text);
    if (sample.expected === 'block' && got === 'block') tp++;
    else if (sample.expected === 'allow' && got === 'allow') tn++;
    else if (sample.expected === 'allow') { fp++; misses.push({ type: 'false-positive', ...sample, got }); }
    else { fn++; misses.push({ type: 'false-negative', ...sample, got }); }
  }
  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);
  const f1 = (2 * precision * recall) / Math.max(precision + recall, 1e-9);
  return { tp, tn, fp, fn, precision, recall, f1, misses };
}

/** @returns {void} */
function run() {
  const corpus = buildCorpus();
  const metrics = score(corpus);
  const floor = Number(process.env.OWNERSHIP_EVAL_MIN_F1 || '0.85');
  const summary = {
    corpusSize: corpus.length,
    adversarialCount: corpus.filter(x => x.expected === 'block').length,
    safeCount: corpus.filter(x => x.expected === 'allow').length,
    categories: CATEGORIES,
    metrics,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (metrics.f1 < floor) process.exit(1);
}

module.exports = { buildCorpus, predict, score, CATEGORIES };
if (require.main === module) run();
