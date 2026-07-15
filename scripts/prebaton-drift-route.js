'use strict';
// prebaton-drift-route (#3421, Epic #3398 C3) — dispatch for prebaton-drift-router.
// Consumes pre-baton drift flags (C1 orphans + C2 sweep flags), routes each into
// the baton: files the Manager-triage-seed (autonomous) or the human-approval
// proposal (irreversible P1/Epic cancel), and emits the Tier-2 anneal. Idempotent
// (skips when a matching seed already exists). NEVER auto-cancels — the router
// yields a human proposal, never a cancel instruction. Ships advisory (#3398 model).
const lib = require('./prebaton-drift-router');
const store = require('./incidents-store');

/**
 * Has a seed/proposal with this exact title already been filed?
 * @param {object} github - octokit client with rest.search.
 * @param {string} owner - repo owner.
 * @param {string} repo - repo name.
 * @param {string} title - candidate seed title.
 * @returns {Promise<boolean>} true when a matching open/closed issue exists.
 */
async function alreadyFiled(github, owner, repo, title) {
  const searchQuery = `${title.replace(/[[\]]/g, '')} in:title repo:${owner}/${repo}`;
  const res = await github.rest.search.issuesAndPullRequests({ q: searchQuery }).catch(() => ({ data: { total_count: 0 } }));
  return (res.data.total_count || 0) > 0;
}

/**
 * Route a batch of flags into the baton.
 * @param {{github:object,context:object,core:object}} ctx - github-script context.
 * @param {Array<object>} flags - raw C1/C2 drift flags.
 * @param {{now?:string,env?:string,appendIncident?:Function}} [opts] - DI seams.
 * @returns {Promise<{routed:Array<object>}>} per-flag routing outcome.
 */
async function run({ github, context, core }, flags, opts = {}) {
  const { owner, repo } = context.repo;
  const nowIso = opts.now || new Date().toISOString();
  const append = opts.appendIncident || store.append;
  const routed = [];
  for (const raw of Array.isArray(flags) ? flags : []) {
    const decision = lib.route(raw, nowIso, opts.env || 'ci');
    if (decision.gate === 'skip') { routed.push({ gate: 'skip', reason: decision.reason }); continue; }
    const payload = decision.seed || decision.humanProposal;
    if (await alreadyFiled(github, owner, repo, payload.title)) {
      append(decision.anneal); routed.push({ ticket: decision.flag.ticket, gate: decision.gate, filed: false });
      continue;
    }
    const created = await github.rest.issues.create({ owner, repo, title: payload.title, body: payload.body, labels: payload.labels });
    append(decision.anneal);
    core?.info?.(`prebaton-drift-route: #${decision.flag.ticket} → ${decision.gate} seed #${created.data.number}`);
    routed.push({ ticket: decision.flag.ticket, gate: decision.gate, filed: true, seed: created.data.number });
  }
  return { routed };
}

module.exports = { run, alreadyFiled };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    try { console.log(JSON.stringify(lib_routeAll(JSON.parse(raw || '[]')), null, 2)); }
    catch (e) { console.error(`invalid input: ${e.message}`); process.exit(1); }
  });
}

// CLI dry-run helper: route flags without any GitHub writes (pure decisions only).
function lib_routeAll(flags) {
  const now = new Date().toISOString();
  return { routed: (Array.isArray(flags) ? flags : []).map((f) => lib.route(f, now, 'local')) };
}
