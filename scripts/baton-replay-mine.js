'use strict';
// Corpus miner for the replay-eval promotion gate (Epic #2037 follow-on, Refs #2692).
// Mechanically parses a posted baton-artifact comment back into the structured input
// that would reproduce it, so replay-eval (baton-replay-eval.js) can measure how many
// REAL historical artifacts the builder reproduces byte-identical. Pure (no network):
// the gh-fetch lives in the CLI/test caller; this module only parses text -> input.
const { ARTIFACT_SPECS } = require('./baton-artifact-schema');

function escapeRe(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Extract each field value from the artifact body, bounded by the next field marker,
// so block values with internal blank lines round-trip exactly. Inverse of renderField.
function extractFields(body, spec) {
  const markers = [];
  for (const field of spec.fields) {
    const found = body.match(new RegExp(`^${escapeRe(field.k)}:`, 'm'));
    if (found) markers.push({ field, start: found.index, len: found[0].length });
  }
  markers.sort((left, right) => left.start - right.start);
  const fields = {};
  for (let index = 0; index < markers.length; index += 1) {
    const current = markers[index];
    const segEnd = index + 1 < markers.length ? markers[index + 1].start : body.length;
    let raw = body.slice(current.start + current.len, segEnd);
    raw = current.field.block ? raw.replace(/^\n/, '').replace(/\n\n$/, '') : raw.replace(/^ /, '').replace(/\n+$/, '');
    fields[current.field.k] = raw;
  }
  return fields;
}

// Parse one artifact comment body into { artifact, role, teamModel, ticket, fields },
// or null if it is not a recognized signed baton artifact.
function parseArtifact(text) {
  const src = String(text || '').replace(/\r\n/g, '\n');
  const nameMatch = src.match(/^##\s+([A-Z_]+)\s*$/m);
  if (!nameMatch) return null;
  const spec = ARTIFACT_SPECS[nameMatch[1]];
  if (!spec) return null;
  const footer = src.match(/\nSigned-by:\s*(.+)\nTeam&Model:\s*(.+)\nRole:\s*([\w-]+)\s*$/);
  if (!footer) return null;
  const ticketMatch = src.match(/^ticket:\s*#(\d+)\s*$/m);
  const body = src.slice(nameMatch.index + nameMatch[0].length, footer.index);
  return {
    artifact: nameMatch[1],
    role: footer[3].trim(),
    teamModel: footer[2].trim(),
    ticket: ticketMatch ? Number(ticketMatch[1]) : undefined,
    fields: extractFields(body, spec),
  };
}

// Turn fetched comment bodies into a replay corpus: each parseable signed artifact
// becomes { name, kind:'comment', input, expected }. Unparseable comments are skipped
// (they are not signed baton artifacts), not counted as mismatches.
function mineCorpus(comments) {
  const corpus = [];
  for (const comment of comments) {
    const text = typeof comment === 'string' ? comment : comment.body;
    const input = parseArtifact(text);
    if (!input) continue;
    // Strip the trailing newline the GitHub comment transport appends — buildArtifact
    // emits no trailing newline, so this is transport normalization, not content drift.
    corpus.push({
      name: `${input.artifact}-${input.ticket || 'x'}`, kind: 'comment', input,
      expected: text.replace(/\r\n/g, '\n').replace(/\n+$/, ''),
    });
  }
  return corpus;
}

module.exports = { parseArtifact, mineCorpus };
