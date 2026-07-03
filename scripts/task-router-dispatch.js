#!/usr/bin/env node
'use strict';
// tier: 3
// Fleet dispatch — always executes against Ollama when lane=fleet. [Refs #574]
const { classifyPrompt } = require('./task-router');
const { chatComplete: ollamaChat } = require('./ollama-direct');
const { getProfile } = require('./fleet-config');
const { resolveRouting } = require('./model-routing-engine');
const { recordTelemetry } = require('./model-routing-telemetry');
const { recordCostEvent } = require('./cost-telemetry');
const policy = require('./model-routing-policy.json');

const args = process.argv.slice(2);
const prompt = (args[args.indexOf('--prompt') + 1]) || '';
const modelIdx = args.indexOf('--model');
const model = modelIdx !== -1 ? args[modelIdx + 1] : undefined;
const json = args.includes('--json');

// Fleet target resolution — primary: 36gbwinresource (GPU), fallback: windows-laptop
function resolveFleetUrl(route) {
  const primary = policy.fleetTargets?.primary;
  if (primary?.ollamaUrl) return primary.ollamaUrl;
  return route.targetOllamaUrl || process.env.OLLAMA_URL || 'http://100.91.113.16:11434';
}

async function tryOllama(targetUrl, selectedModel) {
  try {
    const result = await ollamaChat(prompt, { model: selectedModel, ollamaUrl: targetUrl });
    return result;
  } catch { return { ok: false, error: 'exception' }; }
}

async function buildDecision(route, resolved) {
  if (resolved.lane === 'free') {
    return { action: 'stay-auto', reason: 'lowest adequate lane' };
  }
  if (resolved.lane === 'fleet') {
    const profile = getProfile();
    if (profile.mode === 'solo') {
      return { action: 'fleet-solo-fallback', reason: 'No fleet nodes reachable' };
    }
    if (!prompt) return { action: 'route-fleet', reason: 'no prompt to dispatch' };
    const selectedModel = model || resolved.providerModelId || route.recommendedModel;
    const primaryUrl = resolveFleetUrl(route);
    let chat = await tryOllama(primaryUrl, selectedModel);
    // Graceful fallback on 502/504 or network error
    if (!chat.ok && policy.fleetTargets?.fallback?.ollamaUrl) {
      chat = await tryOllama(policy.fleetTargets.fallback.ollamaUrl, selectedModel);
    }
    if (!chat.ok) return { action: 'fleet-unavailable', reason: chat.error };
    return { action: 'dispatched-fleet', chat, targetUrl: primaryUrl };
  }
  if (resolved.lane === 'haiku') {
    return { action: 'recommend-haiku', reason: 'mid-complexity haiku lane (0.3–0.7)' };
  }
  return { action: 'recommend-sonnet', reason: 'premium lane' };
}

async function main() {
  const route = classifyPrompt(prompt);
  const resolved = resolveRouting(prompt, route);
  const effectiveRoute = { ...route, lane: resolved.lane,
    recommendedModel: resolved.modelId, providerModel: resolved.providerModelId };
  const decision = await buildDecision(effectiveRoute, resolved);
  const outcome = decision.action === 'fleet-unavailable' ? 'fail' : 'ok';
  // #1797: escalation events MUST carry a structured reason for coverage gate compliance.
  const escalation_reason = outcome === 'fail' ? (decision.action || 'unknown-escalation') : null;
  recordTelemetry({ lane: resolved.lane, model: resolved.providerModelId,
    multiplier: resolved.multiplier,
    taskClass: resolved.taskClass, complexityScore: route.complexity ?? null,
    rollbackApplied: resolved.rollbackApplied, outcome, execute: true });
  recordCostEvent(resolved.lane, resolved.providerModelId, { outcome, escalation_reason });
  const result = { route: effectiveRoute, routing: resolved, decision };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`lane=${effectiveRoute.lane}`);
    console.log(`backend=${effectiveRoute.backend}`);
    console.log(`action=${decision.action}`);
    if (decision.chat?.ok) console.log('\n' + decision.chat.content);
    if (decision.chat && !decision.chat.ok) console.error('Fleet error:', decision.chat.error);
  }
  process.exit(decision.action === 'fleet-unavailable' ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
