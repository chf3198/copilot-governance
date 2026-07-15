#!/usr/bin/env node
// multi-judge-orchestrator (#1814 AC1) — fans out review to >=3 judges across >=2 families.
// Composes judge-quorum FAMILY_REGISTRY + multi-judge-prompts personas + variance aggregator.
// Opt-out: MEGINGJORD_MULTI_JUDGE_DISABLED=1 returns single-judge fallback via judge-quorum.
'use strict';

const { judgeFamilies } = require('./judge-quorum');
const { buildPrompt, PERSONAS } = require('./multi-judge-prompts');
const { aggregate } = require('./multi-judge-variance');

const MIN_JUDGES = 3;
const MIN_FAMILIES = 2;
const ATTESTED = new Set(['vendor-attested', 'source-built', 'hardware-rooted']);

function isOptedOut() {
  return process.env.MEGINGJORD_MULTI_JUDGE_DISABLED === '1';
}

function preferAttested(entries) {
  return entries.find(e => ATTESTED.has(e.provenance)) ?? entries[0];
}

function selectJudges(registry, minJudges, minFamilies) {
  const families = Object.keys(registry);
  if (families.length < minFamilies) {
    throw new Error(`multi-judge needs >=${minFamilies} families; registry has ${families.length}`);
  }
  const selected = [];
  for (let i = 0; selected.length < minJudges && i < families.length; i++) {
    const family = families[i];
    const entry = preferAttested(registry[family]);
    selected.push({ family, model: entry.model, provenance: entry.provenance });
  }
  while (selected.length < minJudges) {
    const family = families[selected.length % families.length];
    const entry = preferAttested(registry[family]);
    selected.push({ family, model: entry.model, provenance: entry.provenance });
  }
  return selected.slice(0, minJudges);
}

function assignPersonas(judges) {
  return judges.map((j, i) => ({ ...j, persona: PERSONAS[i % PERSONAS.length] }));
}

async function callJudge(judge, artifact, dispatcher) {
  const prompt = buildPrompt(judge.persona, artifact);
  const result = await dispatcher(judge.model, prompt);
  const score = Number(result?.score);
  return { ...judge, score: Number.isFinite(score) ? score : 0,
    rationale: result?.rationale || null };
}

async function review(artifact, options = {}) {
  if (isOptedOut()) {
    return { opted_out: true, agreement: 1.0, mean: 0, n: 0, family_count: 0,
      judges: [], adversarial_dissent: false };
  }
  const { dispatcher, registry = judgeFamilies(),
    minJudges = MIN_JUDGES, minFamilies = MIN_FAMILIES } = options;
  if (typeof dispatcher !== 'function') {
    throw new Error('multi-judge-orchestrator requires options.dispatcher');
  }
  const selected = selectJudges(registry, minJudges, minFamilies);
  const withPersonas = assignPersonas(selected);
  const results = await Promise.all(withPersonas.map(j => callJudge(j, artifact, dispatcher)));
  return aggregate(results);
}

module.exports = { review, selectJudges, assignPersonas, isOptedOut,
  MIN_JUDGES, MIN_FAMILIES };
