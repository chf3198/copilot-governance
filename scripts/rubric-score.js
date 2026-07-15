#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_RUBRIC = path.join(__dirname, '..', '..', 'inventory', 'rubric-g1-g9-v2.json');

function arg(name, args = process.argv.slice(2)) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function readText(file) {
  if (!file) return '';
  return fs.readFileSync(file, 'utf8');
}

function sourceText(ctx, source) {
  return String(ctx[source] || '');
}

function evaluateCommand(command, ctx) {
  const [kind, source, ...rest] = String(command || '').split(':');
  const expr = rest.join(':');
  const text = sourceText(ctx, source);
  if (kind === 'contains') {
    const missing = expr.split('|').filter(token => !text.includes(token));
    return { ok: missing.length === 0, detail: missing.length ? `missing: ${missing.join(', ')}` : 'matched' };
  }
  if (kind === 'regex' || kind === 'not_regex') {
    const matched = new RegExp(expr, 'im').test(text);
    return { ok: kind === 'regex' ? matched : !matched, detail: matched ? 'matched' : 'not matched' };
  }
  return { ok: false, detail: `unknown evidence command: ${command}` };
}

function validateRubric(rubric) {
  const goals = rubric.goals || {};
  const missing = [];
  // v2 covers G1-G9 (9 goals); v3 covers G1-G10 (#1967). Derive max from rubric version.
  const maxGoal = String(rubric.version || '').includes('g10') ? 10 : 9;
  for (let goalNum = 1; goalNum <= maxGoal; goalNum += 1) {
    const goal = goals[`G${goalNum}`];
    if (!goal || !Array.isArray(goal.boxes) || goal.boxes.length < 3) missing.push(`G${goalNum}`);
  }
  return { ok: missing.length === 0, missing };
}

function scoreRubric(rubric, ctx) {
  const validity = validateRubric(rubric);
  if (!validity.ok) throw new Error(`rubric goals missing >=3 boxes: ${validity.missing.join(', ')}`);
  const out = { rubric_version: rubric.version, goals: {}, mean: 0 };
  for (const [goalId, goal] of Object.entries(rubric.goals)) {
    const boxes = goal.boxes.map(box => ({ ...box, ...evaluateCommand(box.evidence_command, ctx) }));
    const checked = boxes.filter(box => box.ok).length;
    const total = boxes.length;
    out.goals[goalId] = {
      title: goal.title, boxes_checked: checked, boxes_total: total,
      score: Number(((checked / total) * 10).toFixed(2)), boxes,
    };
  }
  const scores = Object.values(out.goals).map(goal => goal.score);
  out.mean = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
  Object.assign(out, computePrecedence(out.goals, rubric, null));
  return out;
}

// #2136: priority_weights_v1 — G1=10, G2=9, ... descending. Synthesizes weights for
// legacy v2 rubrics that lack precedence_weights. Returns {weighted_mean_precedence, precedence_verdict}.
const DEFAULT_PRECEDENCE_THRESHOLD = 7.0; // matches schema precedence_pass_threshold default
function computePrecedence(goals, rubric, thresholdOverride) {
  const goalIds = Object.keys(goals);
  const schemaWeights = rubric.precedence_weights || {};
  // Synthesize descending weights for goals present in the rubric (largest weight = first goal)
  const defaultWeight = (id) => Math.max(1, goalIds.length - goalIds.indexOf(id));
  const weight = (id) => (schemaWeights[id] != null ? schemaWeights[id] : defaultWeight(id));
  let weightedSum = 0, totalWeight = 0;
  for (const [id, goal] of Object.entries(goals)) {
    const goalWeight = weight(id);
    weightedSum += goal.score * goalWeight;
    totalWeight += goalWeight;
  }
  const wmp = totalWeight > 0 // guard: empty goals → wmp=0, verdict=fail (intentional)
    ? Number((weightedSum / totalWeight).toFixed(2)) : 0;
  const threshold = thresholdOverride != null ? thresholdOverride
    : (rubric.precedence_pass_threshold != null ? rubric.precedence_pass_threshold : DEFAULT_PRECEDENCE_THRESHOLD);
  return { weighted_mean_precedence: wmp, precedence_verdict: wmp >= threshold ? 'pass' : 'fail' };
}

function cli() {
  const rubricPath = arg('--rubric') || DEFAULT_RUBRIC;
  const rubric = JSON.parse(readText(rubricPath));
  const thresholdArg = arg('--threshold');
  const threshold = thresholdArg != null ? Number(thresholdArg) : null;
  const ctx = {
    trail: readText(arg('--trail')), diff: readText(arg('--diff')),
    closeout: readText(arg('--closeout')),
  };
  const result = scoreRubric(rubric, ctx);
  // Apply CLI threshold override after scoring
  if (threshold != null) {
    const precedence = computePrecedence(result.goals, rubric, threshold);
    result.weighted_mean_precedence = precedence.weighted_mean_precedence;
    result.precedence_verdict = precedence.precedence_verdict;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) cli();
module.exports = { evaluateCommand, scoreRubric, validateRubric, computePrecedence, DEFAULT_RUBRIC };

