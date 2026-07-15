#!/usr/bin/env node
'use strict';
// #3170 — operator-local inventory overlay merge (Epic #3162 Phase-1 D3).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const KINDS = {
  devices: { example: 'devices.example.json', local: 'devices.json' },
  'ai-models': { example: 'ai-models.example.json', local: 'ai-models.json' },
  services: { example: 'services.example.json', local: 'services.json' },
  'fleet-latency-profile': { example: 'fleet-latency-profile.example.json', local: 'fleet-latency-profile.json' },
};
const REPO = path.resolve(__dirname, '..', '..', 'inventory');
const LOCAL = path.join(os.homedir(), '.megingjord');

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function envKeyForDevice(id) {
  return `FLEET_IP_${String(id).toUpperCase().replace(/-/g, '_')}`;
}

function mergeDeviceList(base, overlay) {
  const map = new Map((base || []).map((device) => [device.id, { ...device }]));
  for (const device of overlay || []) {
    const prev = map.get(device.id) || {};
    const merged = { ...prev, ...device };
    if (Array.isArray(device.ollamaModels)) merged.ollamaModels = device.ollamaModels.slice();
    map.set(device.id, merged);
  }
  return [...map.values()];
}

function applyEnvDevices(devices) {
  return devices.map((device) => {
    const ip = process.env[envKeyForDevice(device.id)];
    return ip ? { ...device, tailscaleIP: ip, ip } : device;
  });
}

function enrichFromProbe(doc, root) {
  const cap = readJson(path.join(root || process.cwd(), '.dashboard', 'capabilities.json'));
  if (!cap?.fleet) return doc;
  const devices = (doc.devices || []).map((device) => {
    const probe = cap.fleet[device.id];
    if (!probe) return device;
    return { ...device, probeReachable: probe.reachable, probeModels: probe.models };
  });
  return { ...doc, devices };
}

function deepMergeObjects(base, overlay) {
  const out = { ...(base || {}) };
  for (const [key, val] of Object.entries(overlay || {})) {
    if (val && typeof val === 'object' && !Array.isArray(val) && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = deepMergeObjects(out[key], val);
    } else out[key] = val;
  }
  return out;
}

function resolveInventory(kind = 'devices', opts = {}) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`unknown inventory kind: ${kind}`);
  const localDir = opts.localDir || LOCAL;
  const baseline = readJson(path.join(REPO, spec.example)) || {};
  const overlay = readJson(path.join(localDir, spec.local)) || {};
  let doc = kind === 'devices'
    ? { ...baseline, ...overlay, devices: applyEnvDevices(mergeDeviceList(baseline.devices, overlay.devices)) }
    : deepMergeObjects(baseline, overlay);
  if (kind === 'devices' && opts.probeEnrich !== false) {
    doc = enrichFromProbe(doc, opts.repoRoot || path.join(REPO, '..'));
  }
  doc._source = { kind, example: spec.example, overlay: fs.existsSync(path.join(localDir, spec.local)) };
  return doc;
}

module.exports = { resolveInventory, mergeDeviceList, applyEnvDevices, envKeyForDevice, KINDS, deepMergeObjects };
