#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { readTelemetry, summarize } = require('./model-routing-telemetry');
const { normalizePremiumRationale, resolveBudget } = require('./premium-budget-governor');
const { emitFallback } = require('./routing-fallback-emit');

const FILE = path.join(__dirname, 'model-routing-policy.json');
const ADAPTER_FILE = path.join(__dirname, 'routing-provider-adapters.json');
const POLICY_OVERRIDES = path.join(os.homedir(), '.megingjord', 'cascade-policy-overrides.json');

function loadOverrides() {
  try {
    if (!fs.existsSync(POLICY_OVERRIDES)) return null;
    return JSON.parse(fs.readFileSync(POLICY_OVERRIDES, 'utf8'));
  } catch { return null; }
}

function loadPolicy() { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
function loadAdapters() { return JSON.parse(fs.readFileSync(ADAPTER_FILE, 'utf8')); }

function score(text, words) {
  return (words || []).reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
}

function classifyTask(prompt, classes) {
  const text = String(prompt || '').toLowerCase();
  const keys = Object.keys(classes || {});
  let best = keys[0] || 'routine';
  let top = -1;
  for (const k of keys) {
    const sv = score(text, classes[k]);
    if (sv > top) { top = sv; best = k; }
  }
  return best;
}

function shouldRollback(policy) {
  const rb = policy.rollback || {};
  if (!rb.enabled) return false;
  const stats = summarize(readTelemetry(rb.windowDays || 7));
  if (stats.samples < 5) return false;
  return stats.successRate < (rb.minSuccessRate ?? 0.75) ||
    stats.premiumShare > (rb.maxPremiumShare ?? 0.45);
}

function applyComplexityThresholds(lane, complexity, thresholds) {
  const thresh = thresholds || {};
  if (lane === 'premium' && complexity < (thresh.premium ?? 0.7)) {
    return complexity < (thresh.haiku ?? 0.3) ? 'fleet' : 'haiku';
  }
  return lane;
}

// Refs #2320: resolve per-role preferred lane given complexity score.
// Returns null when role is absent or not in policy, deferring to standard cascade.
function resolveRolePreference(policy, role, complexity) {
  const prefs = policy.per_role_lane_preferences;
  if (!prefs || !role) return null;
  const rolePref = prefs[String(role).toLowerCase()];
  if (!rolePref) return null;
  const thresh = policy.complexityThresholds || {};
  if (complexity < (thresh.haiku ?? 0.3)) return rolePref.low || null;
  if (complexity < (thresh.premium ?? 0.7)) return rolePref.mid || null;
  return rolePref.high || null;
}

// Refs #2351: resolve model for lane, emit telemetry when fallback path is taken.
function resolveModel(policy, lane, role, prompt) {
  const laneModel = policy.models[lane];
  if (laneModel) return laneModel;
  const fallbackModel = policy.models.fallback;
  emitFallback({
    role,
    laneIntended: lane,
    laneActual: 'fallback',
    fallbackReason: 'lane_model_missing',
    prompt,
  });
  return fallbackModel;
}

function buildRoutingResult(lane, cx, role, rolePrefLane, prompt, route, taskClass, policy) {
  const premiumRationale = lane === 'premium'
    ? normalizePremiumRationale(route, prompt, taskClass, cx) : null;
  const budget = resolveBudget(policy, route, lane);
  if (budget.downgraded) lane = 'haiku'; // eslint-disable-line no-param-reassign
  const model = resolveModel(policy, lane, role, prompt);
  const adapter = loadAdapters().lanes?.[lane] || {};
  const overrides = loadOverrides();
  return {
    lane, modelId: adapter.capabilityTier || model.id,
    providerModelId: adapter.defaultModelId || model.id,
    providerPath: adapter.defaultProvider || model.endpoint || null,
    adapterId: adapter.defaultAdapter || null,
    multiplier: model.mult, taskClass,
    complexity: cx, rolePrefApplied: rolePrefLane !== null, activeRole: role,
    premiumRationale, premiumBudget: budget,
    overridesApplied: overrides !== null, overridesStale: overrides?.stale ?? false,
  };
}

function resolveRouting(prompt, route, opts) {
  const policy = loadPolicy();
  const rollbackApplied = route.disableRollback ? false : shouldRollback(policy);
  let lane = rollbackApplied ? policy.rollback.forceLane : route.lane;
  const cx = route.complexity ?? 0.5;
  lane = applyComplexityThresholds(lane, cx, policy.complexityThresholds);
  const role = (opts && opts.role) || route.role || null;
  const rolePrefLane = !rollbackApplied ? resolveRolePreference(policy, role, cx) : null;
  if (rolePrefLane) lane = rolePrefLane;
  const taskClass = classifyTask(prompt, policy.taskClasses);
  return { rollbackApplied,
    ...buildRoutingResult(lane, cx, role, rolePrefLane, prompt, route, taskClass, policy) };
}

module.exports = { resolveRouting, resolveRolePreference, loadPolicy, loadAdapters, loadOverrides };
