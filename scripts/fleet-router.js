// tier: 3
// fleet-router.js — cost-aware fleet routing per Phase-0 §2 (#2524)
// Consumes resolveInventory(devices + fleet-latency-profile) + fleet-probe.js (#3170).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { resolveInventory } = require('./resolve-inventory');

const DEFAULT_TTFT_P99_S = 999;
const DEFAULT_TOTAL_P99_S = 9999;
const DEFAULT_TIMEOUT_S = 600;

const TIER_LOCAL = 0;
const TIER_FLEET = 1;
const TIER_CLOUD_FREE = 2;
const TIER_CLOUD_CHEAP = 3;
const TIER_CLOUD_STANDARD = 4;
const TIER_CLOUD_PREMIUM = 5;

function loadInventory(devicesPath = null, profilePath = null, fsImpl = fs) {
  const devices = devicesPath
    ? JSON.parse(fsImpl.readFileSync(devicesPath, 'utf8'))
    : resolveInventory('devices', { probeEnrich: false });
  const profileDoc = profilePath
    ? JSON.parse(fsImpl.readFileSync(profilePath, 'utf8'))
    : resolveInventory('fleet-latency-profile', { probeEnrich: false });
  return { devices: devices.devices || [], profile: profileDoc.hosts || {} };
}

function tierForDevice(device) {
  if (device.local && (!device.ollamaModels || device.ollamaModels.length === 0)) return TIER_LOCAL;
  if (device.local) return TIER_LOCAL;
  if (device.tailscale && device.ollama) return TIER_FLEET;
  return TIER_FLEET;
}

function candidatesFromInventory({ devices, profile, max_tier = TIER_CLOUD_CHEAP, task_class = 'any' }) {
  const out = [];
  for (const dev of devices) {
    const tier = tierForDevice(dev);
    if (tier > max_tier) continue;
    if (!dev.ollamaModels) continue;
    const hostProfile = profile[dev.id] || profile[dev.alias] || {};
    for (const model of dev.ollamaModels) {
      const lat = (hostProfile.models || {})[model] || {};
      out.push({
        host: dev.tailscaleIP || dev.hostname,
        host_id: dev.id,
        model,
        tier,
        priority: dev.routing && dev.routing.priority || 0,
        ttft_p99_s: lat.ttft_p99_s || DEFAULT_TTFT_P99_S,
        total_p99_s: lat.total_p99_s || DEFAULT_TOTAL_P99_S,
        timeout_recommendation_s: lat.timeout_recommendation_s || DEFAULT_TIMEOUT_S,
      });
    }
  }
  return out;
}

function scoreCandidate(c, current_load_map = {}) {
  const load = current_load_map[`${c.host_id}:${c.model}`] || 0;
  // Lower is better: prefer cheap (low tier), low load, fast p99
  return c.tier * 1000 + load * 100 + (c.total_p99_s / 60);
}

async function routeForTask(task_class, opts = {}) {
  const { devices, profile } = loadInventory(opts.devices_path, opts.profile_path, opts.fs || fs);
  const cands = candidatesFromInventory({ devices, profile, max_tier: opts.max_tier, task_class });
  if (cands.length === 0) return null;
  const load_map = opts.current_load_map || {};
  const scored = cands.map((c) => ({ ...c, score: scoreCandidate(c, load_map) }));
  scored.sort((a, b) => a.score - b.score);
  const top = scored[0];
  const fallback_chain = scored.slice(1, 3);
  return { ...top, fallback_chain };
}

module.exports = {
  routeForTask, loadInventory, candidatesFromInventory, scoreCandidate, tierForDevice,
  TIER_LOCAL, TIER_FLEET, TIER_CLOUD_FREE, TIER_CLOUD_CHEAP, TIER_CLOUD_STANDARD, TIER_CLOUD_PREMIUM,
};
