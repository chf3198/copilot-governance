// Governed MCP tool broker (#2847 P1-0 child of #2802; design D14). Executes a fleet model's tool call
// ONLY after fleet-mcp-tools.js#authorizeToolCall approves it (OA2 gate is non-bypassable here). Token
// brokering (OA8/G4): GitHub calls run via the operator's ambient `gh` auth through execFile; the token
// is never placed in args nor returned in a tool result — the fleet model sees results only. Read tools
// reuse the shipped fleet-context-bundle primitives (no parallel RAG, D13). Side-effects (gh exec, wiki,
// fs) are injectable so unit + stress tests stay network-free.
const { execFileSync } = require('child_process');
const { authorizeToolCall } = require('./fleet-mcp-tools');
const { repoMap, wikiContext } = require('./fleet-context-bundle');

// Provenance header stamped on every fleet self-comment so it is auditable (G8) and unmistakable for an
// operator/baton artifact (OA9) — defense-in-depth alongside the validator's baton-marker rejection.
const FLEET_COMMENT_HEADER =
  '> 🤖 fleet-model advisory via governed MCP self-comment adapter — NOT a baton/governance artifact\n\n';

const GH_READ_ARGS = {
  issue: (number) => ['issue', 'view', String(number), '--json', 'title,body,state,comments'],
  pr: (number) => ['pr', 'view', String(number), '--json', 'title,body,state,files'],
  repo: () => ['repo', 'view', '--json', 'name,description,defaultBranchRef'],
};

function ghRead(args, deps) {
  const exec = deps.exec || execFileSync;
  const raw = exec('gh', GH_READ_ARGS[args.kind](args.number), { encoding: 'utf8' });
  return { ok: true, result: JSON.parse(raw) };
}

function wikiRead(args, deps) {
  const search = deps.wikiSearch || wikiContext;
  return { ok: true, result: search(args.query) };
}

function repoRead(args, deps) {
  const mapper = deps.repoMap || repoMap;
  return { ok: true, result: mapper(args.paths, deps.root || process.cwd()) };
}

function selfComment(args, deps) {
  const exec = deps.exec || execFileSync;
  const body = FLEET_COMMENT_HEADER + args.body;
  exec('gh', ['issue', 'comment', String(args.issue), '--body', body], { encoding: 'utf8' });
  return { ok: true, result: { posted: true, issue: args.issue } };
}

const HANDLERS = { github_read: ghRead, wiki_search: wikiRead, repo_map: repoRead, github_self_comment: selfComment };

// invokeTool(name, args, deps) -> { ok, result } | { ok:false, reason }. Authorizes first (OA2); a
// denied call never reaches a handler. A handler throw returns a GENERIC reason to the (untrusted) fleet
// model — the raw error (which may carry `gh` stderr: private repo names, file paths) goes only to the
// operator's stderr (G8), never back to the model (info-disclosure guard, #2847 gemini review LOW).
function invokeTool(toolName, args = {}, deps = {}) {
  const auth = authorizeToolCall(toolName, args);
  if (!auth.allowed) return { ok: false, reason: auth.reason };
  try {
    return HANDLERS[toolName](args, deps);
  } catch (err) {
    process.stderr.write(`[fleet-mcp-broker] tool '${toolName}' failed: ${err.message}\n`);
    return { ok: false, reason: `tool '${toolName}' failed` };
  }
}

module.exports = { invokeTool, FLEET_COMMENT_HEADER };
