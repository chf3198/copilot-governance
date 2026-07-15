'use strict';
// Cross-team Consultant pickup queue (#1305).
// Substrate-aware (no hard-coded team list). First-claim-wins protocol.

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', '..', 'inventory', 'team-model-signatures.json');
const CLAIM_RE = /CROSS_TEAM_CLAIM:\s*substrate=(\S+?),\s*alias=([^,]+?),\s*expires=(\S+)/;
const CLAIM_RESOLVED = /CROSS_TEAM_CLAIM_(YIELD|EXPIRED|RESOLVED)/;
const RECHECK_DELAY_MS = 5000;
const CLAIM_TTL_HOURS = 24;

function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

function resolveCallerTeam(substrate, registry) {
  // Substrate-first identity per Cross-Team R&D Protocol v2 §3.
  const allowed = registry.teamModelSpec.substrates;
  if (!allowed.includes(substrate)) {
    throw new Error(`Unknown substrate '${substrate}'. Allowed: ${allowed.join(', ')}`);
  }
  // Team is derived from substrate: github-copilot→copilot, codex-cli→codex, etc.
  const substrateToTeam = {
    'github-copilot': 'copilot',
    'codex-cli': 'codex',
    'claude-code-cli': 'claude-code',
    'openclaw-gateway': 'openclaw',
  };
  return substrateToTeam[substrate] || substrate.split('-')[0];
}

function activeClaim(comments) {
  // Returns the most recent unresolved CROSS_TEAM_CLAIM (or null).
  // Resolved markers: _YIELD, _EXPIRED, _RESOLVED.
  for (let i = comments.length - 1; i >= 0; i--) {
    const body = comments[i].body || '';
    if (CLAIM_RESOLVED.test(body)) return null; // queue is clear after resolution
    const m = body.match(CLAIM_RE);
    if (m) return { substrate: m[1], alias: m[2].trim(), expires: m[3], created_at: comments[i].created_at };
  }
  return null;
}

function formatClaim(substrate, alias) {
  const expiresAt = new Date(Date.now() + CLAIM_TTL_HOURS * 3600 * 1000).toISOString();
  return `CROSS_TEAM_CLAIM: substrate=${substrate}, alias=${alias}, expires=${expiresAt}`;
}

function formatYield(substrate, winnerSubstrate) {
  return `CROSS_TEAM_CLAIM_YIELD: substrate=${substrate}, deferred-to=${winnerSubstrate}`;
}

async function listCandidateEpics(github, owner, repo, callerTeam, registry) {
  // List open issues with consultant:cross-team-needed label and Manager not from callerTeam.
  const { data } = await github.rest.issues.listForRepo({
    owner, repo, state: 'open', labels: 'consultant:cross-team-needed,type:epic', per_page: 100,
  });
  // Filter: lead-team Manager substrate ≠ caller. Caller resolves by reading Manager handoff comments.
  return data.map(i => ({ number: i.number, title: i.title, labels: i.labels.map(l => l.name) }));
}

async function tryClaim({ github, context, callerSubstrate, callerAlias, epicNumber }) {
  const { owner, repo } = context.repo;
  // Step 1: ensure label :needed is present
  const { data: epic } = await github.rest.issues.get({ owner, repo, issue_number: epicNumber });
  const labels = epic.labels.map(l => l.name);
  if (!labels.includes('consultant:cross-team-needed')) {
    return { claimed: false, reason: 'no-needed-label' };
  }
  // Step 2: scan for existing CLAIM
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: epicNumber, per_page: 100,
  });
  const existing = activeClaim(comments);
  if (existing && existing.substrate !== callerSubstrate) {
    return { claimed: false, reason: 'already-claimed', by: existing };
  }
  // Step 3: post claim + swap label atomically
  const claimBody = formatClaim(callerSubstrate, callerAlias);
  const posted = await github.rest.issues.createComment({ owner, repo, issue_number: epicNumber, body: claimBody });
  const ourTs = new Date(posted.data.created_at).getTime();
  await github.rest.issues.addLabels({ owner, repo, issue_number: epicNumber, labels: ['consultant:cross-team-in-progress'] });
  await github.rest.issues.removeLabel({ owner, repo, issue_number: epicNumber, name: 'consultant:cross-team-needed' }).catch(() => {});
  await new Promise(r => setTimeout(r, RECHECK_DELAY_MS));
  const afterRace = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: epicNumber, per_page: 100,
  });
  const earlierByOther = afterRace.find(c => {
    const m = (c.body || '').match(CLAIM_RE);
    if (!m || m[1] === callerSubstrate) return false;
    return new Date(c.created_at).getTime() < ourTs;
  });
  if (earlierByOther) {
    const winner = earlierByOther.body.match(CLAIM_RE)[1];
    await github.rest.issues.createComment({
      owner, repo, issue_number: epicNumber,
      body: formatYield(callerSubstrate, winner),
    });
    return { claimed: false, reason: 'race-lost', winner };
  }
  return { claimed: true, expires: claimBody.match(/expires=(\S+)/)[1] };
}

module.exports = { loadRegistry, resolveCallerTeam, activeClaim, formatClaim, formatYield, tryClaim, listCandidateEpics, CLAIM_RE, CLAIM_TTL_HOURS };
