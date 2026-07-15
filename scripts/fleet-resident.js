#!/usr/bin/env node
'use strict';
// tier: 3
// Resident-model preference for fleet review dispatch (#2599, G3). Prefer a
// model already loaded on the Ollama host (/api/ps) so cross-family reviews
// stay on the FREE fleet instead of cold-loading a different model, timing
// out, and falling back to a paid cloud reviewer. Fetch is injectable for
// unit tests; every path degrades gracefully (returns []/null) on error.

/**
 * Names of models currently resident (loaded) on the Ollama host.
 * @param {string} host e.g. "http://100.91.113.16:11434"
 * @param {Function} [fetchImpl] injectable fetch (defaults to global fetch)
 * @returns {Promise<string[]>} resident model names; [] on any error
 */
async function residentModels(host, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!host || !doFetch) return [];
  try {
    const res = await doFetch(`${String(host).replace(/\/$/, '')}/api/ps`,
      { signal: AbortSignal.timeout(5000) });
    if (!res || !res.ok) return [];
    const data = await res.json();
    return (data.models || [])
      .map((m) => m && (m.name || m.model))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * First candidate id currently resident on the host, else null.
 * @param {string[]} candidateIds
 * @param {string} host
 * @param {Function} [fetchImpl]
 * @returns {Promise<string|null>}
 */
async function preferResident(candidateIds, host, fetchImpl) {
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) return null;
  const resident = await residentModels(host, fetchImpl);
  if (resident.length === 0) return null;
  return candidateIds.find((id) => resident.includes(id)) || null;
}

module.exports = { residentModels, preferResident };

if (require.main === module) {
  const host = process.argv[2] || 'http://100.91.113.16:11434';
  residentModels(host).then((m) => process.stdout.write(`${JSON.stringify(m)}\n`));
}
