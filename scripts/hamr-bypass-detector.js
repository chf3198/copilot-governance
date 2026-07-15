'use strict';
// tier: 3
// hamr-bypass-detector — detect direct curls to known provider endpoints that bypass HAMR.
// Refs Epic #2029 #2220. Pure function; consumed by pretool_guard.py via subprocess or directly.

const FLEET_PORT = 11434;
const LOOPBACK_IP_PARTS = [127, 0, 0, 1];
const DEFAULT_FLEET_IP_PARTS = [100, 91, 113, 16];

const PAID_PROVIDER_REGEXES = [
  { name: 'anthropic', re: /https?:\/\/api\.anthropic\.com/i },
  { name: 'openai', re: /https?:\/\/api\.openai\.com/i },
  { name: 'openrouter', re: /https?:\/\/openrouter\.ai/i },
  { name: 'gemini', re: /https?:\/\/generativelanguage\.googleapis\.com/i },
  { name: 'groq', re: /https?:\/\/api\.groq\.com/i },
  { name: 'cerebras', re: /https?:\/\/api\.cerebras\.ai/i },
];

const OVERRIDE_MARKER_RE = /#\s*hamr-bypass-ok:\s*(.+?)(?:\n|$)/i;
const CURL_INVOKE_RE = /\b(?:curl|wget|http|httpie)\b/i;

function ipFromParts(parts) { return parts.join('.'); }

function getFleetSubstrings() {
  const fleetIp = process.env.FLEET_HOST_IP || ipFromParts(DEFAULT_FLEET_IP_PARTS);
  const loopback = ipFromParts(LOOPBACK_IP_PARTS);
  return [
    { name: 'ollama-fleet', literal: fleetIp + ':' + FLEET_PORT },
    { name: 'ollama-local-ip', literal: loopback + ':' + FLEET_PORT },
    { name: 'ollama-local-name', literal: 'localhost:' + FLEET_PORT },
  ];
}

function detectBypass(cmdString) {
  const text = String(cmdString || '');
  if (!CURL_INVOKE_RE.test(text)) return { detected: false, reason: 'not-http-invocation' };
  const matches = [];
  for (const provider of PAID_PROVIDER_REGEXES) {
    if (provider.re.test(text)) matches.push({ name: provider.name, paid: true });
  }
  for (const fleet of getFleetSubstrings()) {
    if (text.includes(fleet.literal)) matches.push({ name: fleet.name, paid: false });
  }
  if (matches.length === 0) return { detected: false, reason: 'no-known-provider-url' };
  const overrideMatch = text.match(OVERRIDE_MARKER_RE);
  if (overrideMatch) {
    return { detected: true, suppressed: true, reason: 'override-marker-present',
      override_reason: overrideMatch[1].trim(), providers: matches };
  }
  return { detected: true, suppressed: false, providers: matches,
    severity: matches.some(function (p) { return p.paid; }) ? 'paid-bypass' : 'fleet-bypass' };
}

function emitIncident(detection, incidentsPath, now) {
  if (!detection || !detection.detected || detection.suppressed) return null;
  const fs = require('node:fs');
  const path = require('node:path');
  const evt = {
    ts: now || Date.now(), version: 3,
    service: 'megingjord-hamr-bypass-detector', env: 'prod',
    event: 'hamr-bypass-detected', pattern_id: 'hamr-bypass-detected',
    severity: detection.severity,
    providers: detection.providers.map(function (provider) { return provider.name; }),
  };
  fs.mkdirSync(path.dirname(incidentsPath), { recursive: true });
  fs.appendFileSync(incidentsPath, JSON.stringify(evt) + '\n');
  return evt;
}

module.exports = { detectBypass, emitIncident, PAID_PROVIDER_REGEXES,
  OVERRIDE_MARKER_RE, getFleetSubstrings, FLEET_PORT };
