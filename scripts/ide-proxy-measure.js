#!/usr/bin/env node
// ide-proxy-measure.js — Phase 2 D5 (#1035).
// Live A/B measurement: classify N representative IDE turns, count routing
// distribution, estimate cost-reduction vs all-Premium baseline.
'use strict';
const path = require('node:path');
const fs = require('node:fs');

const { classify } = require(path.resolve(__dirname, 'ide-proxy-classifier'));
const { estimateCost, recordDecision } = require(path.resolve(__dirname, 'ide-proxy-telemetry'));

const CORPUS_FILE = path.resolve(__dirname, 'ide-proxy-corpus.json');
const CORPUS = JSON.parse(fs.readFileSync(CORPUS_FILE, 'utf8')).turns;
const ROUTE_GATE = 0.30;
const COST_GATE = 0.25;

function run() {
  const summary = { perTurn: [], byLane: {}, costRouted: 0, costBaseline: 0 };
  for (const turn of CORPUS) {
    const decision = classify(turn.text, { fileCount: turn.fileCount, toolCount: 1 });
    const baselineCost = estimateCost('claude-opus-4-7', turn.tokensIn, turn.tokensOut);
    const routedCost = estimateCost(decision.model_group, turn.tokensIn, turn.tokensOut);
    summary.perTurn.push({ id: turn.id, lane: decision.lane, complexity: decision.complexity,
      baselineCost, routedCost, savings: baselineCost - routedCost });
    summary.byLane[decision.lane] = (summary.byLane[decision.lane] || 0) + 1;
    summary.costBaseline += baselineCost;
    summary.costRouted += routedCost;
    recordDecision({ ...decision, model: decision.model_group,
      est_tokens_in: turn.tokensIn, est_tokens_out: turn.tokensOut });
  }
  summary.totalCount = CORPUS.length;
  summary.routedNonAnthropicPct = (CORPUS.length - (summary.byLane.premium || 0) - (summary.byLane.haiku || 0)) / CORPUS.length;
  summary.costReductionPct = (summary.costBaseline - summary.costRouted) / summary.costBaseline;
  return summary;
}

if (require.main === module) {
  const r = run();
  console.log(JSON.stringify({
    totalTurns: r.totalCount,
    byLane: r.byLane,
    routedToFleetPct: (r.routedNonAnthropicPct * 100).toFixed(1) + '%',
    costBaselineUsd: r.costBaseline.toFixed(4),
    costRoutedUsd: r.costRouted.toFixed(4),
    costReductionPct: (r.costReductionPct * 100).toFixed(1) + '%',
    activationGate: r.routedNonAnthropicPct >= ROUTE_GATE && r.costReductionPct >= COST_GATE
      ? 'PASS — meets ≥30% routing + ≥25% cost reduction'
      : 'FAIL — gate not met',
  }, null, 2));
}

module.exports = { run, CORPUS };
