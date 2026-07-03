#!/usr/bin/env node
'use strict';
// tier: 3
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TAILSCALE_TIMEOUT_MS = 5000;
const NETCHECK_TIMEOUT_MS = 3000;
const OLLAMA_DEFAULT_PORT = 11434;
const OPENCLAW_DEFAULT_PORT = 4000;

function loadInventory() {
  const { resolveInventory } = require('./resolve-inventory');
  return resolveInventory('devices', { probeEnrich: false }).devices || [];
}

function detectTailscale() {
  try {
    const out = execSync('tailscale status --json 2>/dev/null || sudo tailscale status --json', {
      encoding: 'utf8', timeout: TAILSCALE_TIMEOUT_MS
    });
    const st = JSON.parse(out);
    const peers = {};
    if (st.Self) peers[st.Self.TailscaleIPs?.[0]] = 'online';
    for (const [, p] of Object.entries(st.Peer || {})) {
      const ip = p.TailscaleIPs?.[0];
      if (ip) peers[ip] = p.Online ? 'online' : 'offline';
    }
    return { ok: true, peers };
  } catch { return { ok: false, peers: {} }; }
}

function resolveFleet() {
  const devices = loadInventory();
  const ts = detectTailscale();
  return devices.map(d => {
    const ip = process.env[`FLEET_IP_${d.id.toUpperCase().replace(/-/g, '_')}`]
      || d.tailscaleIP || null;
    const status = ip && ts.peers[ip] ? ts.peers[ip] : 'unknown';
    return { ...d, resolvedIP: ip, reachable: status === 'online' };
  });
}

function getProfile() {
  const fleet = resolveFleet();
  const online = fleet.filter(d => d.reachable && !d.local);
  if (online.length === 0) return { mode: 'solo', fleet };
  if (online.length < fleet.filter(d => !d.local).length) return { mode: 'degraded', fleet };
  return { mode: 'full', fleet };
}

function getDeviceURL(deviceId, port) {
  const fleet = resolveFleet();
  const d = fleet.find(x => x.id === deviceId);
  if (!d?.resolvedIP) return null;
  return `http://${d.resolvedIP}:${port || OLLAMA_DEFAULT_PORT}`;
}

function getOpenClawURL() {
  return process.env.OPENCLAW_URL || getDeviceURL('windows-laptop', OPENCLAW_DEFAULT_PORT);
}

// F4 (#1040): MagicDNS resolver + relay-vs-direct probe.
function resolveMagicDNS(deviceId) {
  const d = loadInventory().find(x => x.id === deviceId);
  return d?.magicDNS || `${deviceId}.tail-scale.ts.net`;
}

function isRelayed(deviceId) {
  try {
    const out = execSync('tailscale netcheck --format=json 2>/dev/null', {
      encoding: 'utf8', timeout: NETCHECK_TIMEOUT_MS,
    });
    const nc = JSON.parse(out);
    return !nc.UDP && !nc.IPv4CanSend;
  } catch { return null; }
}

function getDeviceURLViaDNS(deviceId, port) {
  const host = resolveMagicDNS(deviceId);
  return `http://${host}:${port || OLLAMA_DEFAULT_PORT}`;
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'profile') console.log(JSON.stringify(getProfile(), null, 2));
  else if (cmd === 'fleet') console.log(JSON.stringify(resolveFleet(), null, 2));
  else if (cmd === 'relay') console.log(JSON.stringify({ relayed: isRelayed() }, null, 2));
  else if (cmd === 'magicdns') console.log(resolveMagicDNS(process.argv[3] || 'windows-laptop'));
  else console.log('Usage: fleet-config.js [profile|fleet|relay|magicdns <id>]');
}

module.exports = { loadInventory, resolveFleet, getProfile, getDeviceURL,
  getOpenClawURL, resolveMagicDNS, isRelayed, getDeviceURLViaDNS };
