#!/usr/bin/env node
// tier: 3
// multi-judge-smoke (#1814) — live smoke test against fleet judges.
// Default: qwen2.5-coder:32b on 36gbwinresource. Reads artifact from stdin/file.
// Exit 0 on aggregate produced; 1 on any judge failure.
'use strict';

const fs = require('node:fs');
const { review } = require('./multi-judge-orchestrator');
const { chatComplete } = require('./ollama-direct');

const FLEET_MODELS = {
  qwen: 'qwen2.5-coder:32b',
  llama: 'qwen2.5-coder:7b',
  gemini: 'granite-code:3b',
};

const FLEET_REGISTRY = {
  qwen: [{ model: FLEET_MODELS.qwen, provenance: 'vendor-attested' }],
  llama: [{ model: FLEET_MODELS.llama, provenance: 'vendor-attested' }],
  gemini: [{ model: FLEET_MODELS.gemini, provenance: 'unverified' }],
};

function parseScoreJson(content) {
  const match = String(content || '').match(/\{[\s\S]*?"per_goal"[\s\S]*?\}/);
  if (!match) return { score: null, rationale: 'unparseable' };
  try {
    const obj = JSON.parse(match[0]);
    const values = Object.values(obj.per_goal || {}).map(Number).filter(Number.isFinite);
    if (!values.length) return { score: null, rationale: obj.rationale || 'empty' };
    const mean = values.reduce((s, n) => s + n, 0) / values.length;
    return { score: mean, rationale: typeof obj.rationale === 'string' ? obj.rationale.slice(0, 200) : null };
  } catch { return { score: null, rationale: 'json-parse-error' }; }
}

async function fleetDispatcher(model, prompt) {
  const result = await chatComplete(prompt, { model, maxTokens: 600 });
  if (!result.ok) return { score: null, rationale: `dispatch-failed: ${result.error}` };
  return parseScoreJson(result.content);
}

async function main() {
  const artifactArg = process.argv[2];
  const artifact = artifactArg && artifactArg !== '-' && fs.existsSync(artifactArg)
    ? fs.readFileSync(artifactArg, 'utf8') : fs.readFileSync(0, 'utf8');
  const result = await review(artifact, {
    registry: FLEET_REGISTRY, dispatcher: fleetDispatcher });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.opted_out || result.n > 0 ? 0 : 1);
}

if (require.main === module) main().catch(e => {
  process.stderr.write(`smoke failed: ${e.message}\n`); process.exit(1);
});

module.exports = { fleetDispatcher, parseScoreJson, FLEET_MODELS, FLEET_REGISTRY };
