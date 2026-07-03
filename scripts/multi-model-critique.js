#!/usr/bin/env node
'use strict';
// multi-model-critique (#1912 / #1913 iteration) — runs a single artifact
// (research note, plan, design doc) through N HAMR-wrapped fleet models
// from distinct families and returns parallel critiques for synthesis.
// Per Epic #1612 + memory feedback-cross-family-review-model-choice.

const fs = require('node:fs');
const { fleetCall } = require('./fleet-via-hamr.js');

const DEFAULT_TIMEOUT_MS = 240000;
const DEFAULT_RAW_CAP = 2000;
const ARTIFACT_CHAR_CAP = 6000;
const MODELS = [
  { id: 'qwen-32b', team: 'fleet', model: 'qwen2.5-coder:32b', tier: 'fleet-large', family: 'alibaba' },
  { id: 'granite-3b', team: 'fleet', model: 'granite-code:3b', tier: 'fleet-large', family: 'ibm' },
  { id: 'starcoder-3b', team: 'fleet', model: 'starcoder2:3b', tier: 'fleet-large', family: 'bigcode' },
];

const PROMPT_TEMPLATE = `You are an INDEPENDENT cross-family code-review critic. Critique the research/planning artifact below for the Megingjord harness Epic #1912 (orchestrator governance parity across Claude Code, Copilot, Codex).

Identify in this exact format (no other prose):
GAPS: <comma-separated list of missing surfaces or analysis gaps>
WEAKNESSES: <comma-separated list of soft / hand-wavy claims>
MISSING_CHILDREN: <list of additional development child-tickets the dev plan should add>
SCOPE_ERRORS: <list of dev children that look out-of-scope or duplicative>
OVERALL: <one sentence verdict>

ARTIFACT:
{{ARTIFACT}}`;

function buildPrompt(artifact) {
  return PROMPT_TEMPLATE.replace('{{ARTIFACT}}', String(artifact || '').slice(0, ARTIFACT_CHAR_CAP));
}

async function critiqueOne(model, prompt, opts = {}) {
  const start = Date.now();
  try {
    const resp = await fleetCall({ prompt, tier: model.tier, model: model.model },
      { timeoutMs: opts.timeoutMs || DEFAULT_TIMEOUT_MS });
    const text = resp?.value?.data?.response || '';
    return { ok: true, model_id: model.id, family: model.family, model: model.model,
      elapsed_ms: Date.now() - start, raw: text, raw_truncated: text.slice(0, opts.rawCap || DEFAULT_RAW_CAP) };
  } catch (err) {
    return { ok: false, model_id: model.id, family: model.family, error: String(err.message || err),
      elapsed_ms: Date.now() - start };
  }
}

async function critique(artifact, opts = {}) {
  const prompt = buildPrompt(artifact);
  const models = opts.models || MODELS;
  const results = await Promise.all(models.map(model => critiqueOne(model, prompt, opts)));
  return { artifact_chars: String(artifact || '').length, models: results.length,
    families: [...new Set(results.map(r => r.family))], results };
}

if (require.main === module) {
  const artifactPath = process.argv[2];
  if (!artifactPath) { console.error('usage: multi-model-critique <file.md>'); process.exit(1); }
  const artifact = fs.readFileSync(artifactPath, 'utf8');
  critique(artifact).then(result => {
    if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else {
      process.stdout.write(`\nMulti-model critique (${result.models} models across ${result.families.length} families)\n\n`);
      for (const critique of result.results) {
        process.stdout.write(`### ${critique.model_id} (${critique.family}) — ${critique.elapsed_ms}ms ${critique.ok ? '' : 'FAILED: ' + critique.error}\n\n`);
        if (critique.ok) process.stdout.write(critique.raw_truncated + '\n\n---\n\n');
      }
    }
    process.exit(0);
  }).catch(err => { console.error(err); process.exit(2); });
}

module.exports = { critique, critiqueOne, buildPrompt, MODELS };
