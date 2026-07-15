'use strict';
// tier: 3
// timeout-policy — adaptive timeout per lane/model/workload class.
// Refs Epic #2150 #2201. Addresses Phase-0 #2174 observation: 600s hardcoded
// bound was insufficient for qwen2.5-coder:32b (907s p99 actual).

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_POLICY_PATH = path.join(__dirname, '..', '..', 'config', 'timeout-policy.json');

function loadPolicy(policyPath = DEFAULT_POLICY_PATH) {
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

function classFromModel(model) {
  if (!model) return null;
  if (model.includes('qwen2.5-coder:32b') || model.includes('qwen2.5-coder:14b')) return 'fleet-red-team-rate';
  if (model.includes('qwen2.5-coder')) return 'fleet-dispatch-basic';
  if (model.includes('gemma3:1b')) return 'ollama-chromebook-local';
  return null;
}

function getTimeout({ lane, model, workloadClass, policy } = {}) {
  const policyObj = policy || loadPolicy();
  const cls = workloadClass || classFromModel(model);
  const classEntry = cls && policyObj.classes && policyObj.classes[cls];
  const baseMs = (classEntry && classEntry.ms) || policyObj.default_ms;
  const laneOverride = lane && policyObj.lane_overrides && policyObj.lane_overrides[lane];
  const multiplier = (laneOverride && laneOverride.multiplier) || 1.0;
  return Math.floor(baseMs * multiplier);
}

function listClasses(policy) {
  const policyObj = policy || loadPolicy();
  return Object.keys(policyObj.classes || {});
}

module.exports = { getTimeout, loadPolicy, classFromModel, listClasses, DEFAULT_POLICY_PATH };
