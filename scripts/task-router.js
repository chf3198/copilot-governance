#!/usr/bin/env node
'use strict';
// tier: 3
const fs = require('fs');
const path = require('path');

const policyPath = path.join(__dirname, 'task-router-policy.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const inventory = require('./resolve-inventory').resolveInventory('devices', { probeEnrich: false });
const aiRules = require('./resolve-inventory').resolveInventory('ai-models', { probeEnrich: false }).optimizationStrategy || {};

function score(prompt, list) {
  const text = String(prompt || '').toLowerCase();
  return list.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
}

function inferFleetClass(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (/(implement|refactor|tests|batch|multi-file)/.test(text)) return 'heavy-coding';
  if (/(integration|migration|workflow|transform|pattern)/.test(text)) return 'coding';
  return 'general';
}

function pickFleetTarget(prompt) {
  const wanted = inferFleetClass(prompt);
  const devices = (inventory.devices || []).filter(d => d.ollama && d.routing && !d.local);
  const rank = { tiny: 0, general: 1, coding: 2, 'heavy-coding': 3 };
  const wantedRank = rank[wanted] ?? 1;
  const scored = devices.map(d => {
    const r = d.routing || {};
    const hit = (r.preferredFor || []).reduce((n, k) => n + (String(prompt).toLowerCase().includes(k) ? 1 : 0), 0);
    const fit = Math.max(0, (rank[r.inferenceClass] ?? 0) - wantedRank + 1);
    const pri = Number(r.priority || 0);
    return { d, s: hit * 1000 + fit * 100 + pri };
  }).sort((a, b) => b.s - a.s);
  const pick = scored[0]?.d;
  return !pick ? null : {
    targetDevice: pick.id,
    targetOllamaUrl: pick.tailscaleIP ? `http://${pick.tailscaleIP}:11434` : null,
    targetClass: pick.routing?.inferenceClass || 'general'
  };
}

function classifyPrompt(prompt) {
  const free = score(prompt, policy.lanes.free.keywords);
  const fleet = score(prompt, policy.lanes.fleet.keywords);
  const premium = score(prompt, policy.lanes.premium.keywords);
  const premiumBoost = score(prompt, policy.escalation.premiumOn);
  const fleetBoost = score(prompt, policy.escalation.fleetOn);
  const totals = {
    free,
    fleet: fleet + fleetBoost,
    premium: premium + premiumBoost
  };
  let lane = policy.defaultLane;
  const fleetMin = policy.fleetMinScore ?? 2;
  if (totals.premium >= 2 && totals.premium >= totals.fleet) lane = 'premium';
  else if (totals.fleet >= fleetMin) lane = 'fleet';
  else if (totals.free >= 2) lane = 'free';
  const totalScore = Object.values(totals).reduce((s, v) => s + v, 0) + 0.01;
  const complexity = +(Math.min(1.0, totals.premium / totalScore)).toFixed(2);
  if (aiRules.rule3 && complexity < 0.7 && lane === 'premium') lane = 'fleet';
  const selected = policy.lanes[lane];
  const target = lane === 'fleet' ? pickFleetTarget(prompt) : null;
  const confidence = lane === 'free' && free < 2 ? 'medium' : 'high';
  return {
    lane,
    complexity,
    backend: selected.backend,
    recommendedModel: selected.recommendedModel,
    targetDevice: target?.targetDevice || null,
    targetOllamaUrl: target?.targetOllamaUrl || null,
    targetClass: target?.targetClass || null,
    confidence,
    scores: totals,
    rationale: `${lane} selected from keyword score`,
    triggers: Object.entries(totals).filter(([, v]) => v > 0).map(([k]) => k)
  };
}

function runCli(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const prompt = (args[args.indexOf('--prompt') + 1]) || '';
  const report = classifyPrompt(prompt);
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`lane=${report.lane}`);
    console.log(`backend=${report.backend}`);
    console.log(`model=${report.recommendedModel}`);
    if (report.targetDevice) console.log(`target=${report.targetDevice}`);
    console.log(`confidence=${report.confidence}`);
    console.log(`rationale=${report.rationale}`);
  }
  return 0;
}

if (require.main === module) process.exit(runCli(process.argv));
module.exports = { classifyPrompt, runCli };
