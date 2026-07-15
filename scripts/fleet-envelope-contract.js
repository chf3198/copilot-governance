'use strict';

const CONTEXT_ENVELOPE_SCHEMA = 'fleet-context-envelope/v1';
const CAPABILITY_MANIFEST_SCHEMA_VERSION = 2;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateContextOpts(opts = {}) {
  if (!isPlainObject(opts)) throw new TypeError('context options must be an object');
  const normalized = {};
  if (opts.task === undefined || opts.task === null) normalized.task = '';
  else if (typeof opts.task !== 'string') throw new TypeError('task must be a string');
  else normalized.task = opts.task;
  for (const key of ['ticket', 'maxContextChars']) {
    const value = opts[key];
    if (value === undefined || value === null) continue;
    if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${key} must be a positive integer`);
    normalized[key] = value;
  }
  for (const key of ['paths', 'alreadyBundled']) {
    if (opts[key] === undefined || opts[key] === null) continue;
    if (!Array.isArray(opts[key])) throw new TypeError(`${key} must be an array of non-empty strings`);
    if (opts[key].some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
      throw new TypeError(`${key} must be an array of non-empty strings`);
    }
    normalized[key] = opts[key].slice();
  }
  if (opts.wikiQuery !== undefined && opts.wikiQuery !== null) {
    if (typeof opts.wikiQuery !== 'string') throw new TypeError('wikiQuery must be a string');
    normalized.wikiQuery = opts.wikiQuery;
  }
  return normalized;
}

function buildContextObservability({ included = [], truncated = false, manifestSchema = null } = {}) {
  return {
    schema: CONTEXT_ENVELOPE_SCHEMA,
    manifestSchema,
    included: [...included],
    truncated: Boolean(truncated),
  };
}

function assertStringArray(value, message) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new TypeError(message);
  }
}

function validateContextEnvelope(envelope) {
  if (!isPlainObject(envelope)) throw new TypeError('context envelope must be an object');
  if (typeof envelope.prompt !== 'string') throw new TypeError('context envelope prompt must be a string');
  if (!isPlainObject(envelope.manifest)) throw new TypeError('context envelope manifest must be an object');
  if (envelope.manifest.schema !== 'fleet-context-bundle/v1') throw new TypeError('context envelope manifest schema must be fleet-context-bundle/v1');
  assertStringArray(envelope.manifest.included, 'context envelope manifest.included must be an array of non-empty strings');
  assertStringArray(envelope.included, 'context envelope included must be an array of non-empty strings');
  if (typeof envelope.truncated !== 'boolean') throw new TypeError('context envelope truncated must be a boolean');
  if (!isPlainObject(envelope.observability)) throw new TypeError('context envelope observability must be an object');
  if (envelope.observability.schema !== CONTEXT_ENVELOPE_SCHEMA) throw new TypeError(`context envelope schema must be ${CONTEXT_ENVELOPE_SCHEMA}`);
  if (envelope.observability.truncated !== envelope.truncated) throw new TypeError('context envelope observability.truncated must match truncated');
  const included = JSON.stringify(envelope.included);
  if (JSON.stringify(envelope.observability.included) !== included) throw new TypeError('context envelope observability.included must match included');
  if (JSON.stringify(envelope.manifest.included) !== included) throw new TypeError('context envelope manifest.included must match included');
  if (envelope.observability.manifestSchema !== envelope.manifest.schema) throw new TypeError('context envelope observability.manifestSchema must match manifest.schema');
  return envelope;
}

function validateCapabilityManifest(manifest) {
  if (!isPlainObject(manifest)) throw new TypeError('capability manifest must be an object');
  if (manifest.schema_version !== CAPABILITY_MANIFEST_SCHEMA_VERSION) {
    throw new TypeError(`capability manifest schema_version must be ${CAPABILITY_MANIFEST_SCHEMA_VERSION}`);
  }
  if (typeof manifest.probed_at !== 'string' || Number.isNaN(Date.parse(manifest.probed_at))) {
    throw new TypeError('capability manifest probed_at must be a valid ISO timestamp');
  }
  for (const key of ['tailscale', 'fleet', 'cloudflare', 'providers', 'mcp', 'r2', 'wrangler', 'github_oidc', 'npm_trusted_publishing']) {
    if (!isPlainObject(manifest[key])) throw new TypeError(`capability manifest ${key} must be an object`);
  }
  if (!isPlainObject(manifest.cloudflare.account)) throw new TypeError('capability manifest cloudflare.account must be an object');
  if (!isPlainObject(manifest.mcp.rag_server)) throw new TypeError('capability manifest mcp.rag_server must be an object');
  return manifest;
}

module.exports = {
  CONTEXT_ENVELOPE_SCHEMA,
  CAPABILITY_MANIFEST_SCHEMA_VERSION,
  validateContextOpts,
  buildContextObservability,
  validateContextEnvelope,
  validateCapabilityManifest,
};