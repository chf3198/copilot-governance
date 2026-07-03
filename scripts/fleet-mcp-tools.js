// Governed MCP tool catalog + OA2 authorization gate for fleet models (#2847 P1-0 child of #2802;
// design D14). The catalog IS the allowlist: a tool not listed here is denied (default-deny). Per the
// client UAT permission boundary, fleet models get READ tools + a single SELF-COMMENT write — never a
// label/close/merge/file-write tool (those are simply absent → unknown → denied). `authorizeToolCall`
// runs BEFORE any execution (see fleet-mcp-broker.js), enforcing OWASP OA2 (Tool Misuse). A self-comment
// is additionally guarded against impersonating a baton governance artifact (OA9 human-agent trust).
const ALLOWED_PERMS = new Set(['read', 'self-comment-write']); // client-decided boundary (UAT)
const GH_READ_KINDS = new Set(['issue', 'pr', 'repo']);
const MAX_REPO_MAP_PATHS = 50; // cap a repo_map request — bounds a scan-DoS from a huge path array (G6)
// A fleet self-comment may carry analysis, NEVER a governance artifact that could advance the baton.
const BATON_MARKERS =
  /(MANAGER_HANDOFF|COLLABORATOR_HANDOFF|ADMIN_HANDOFF|CONSULTANT_(EPIC_)?CLOSEOUT|Signed-by:|Team&Model:|verdict:\s*approve)/i;

const isPosInt = (value) => Number.isInteger(value) && value > 0;
const nonEmptyStr = (value) => typeof value === 'string' && value.trim().length > 0;
// Fold a self-comment to a canonical form before the marker scan: NFKC, strip every Unicode
// whitespace (\p{White_Space}) + format/invisible char (\p{Cf}), then map common Cyrillic/Greek
// homoglyphs of the marker letters back to ASCII. This closes the whitespace/invisible class and the
// frequent homoglyph vector. RESIDUAL: exotic confusables — accepted as LOW, mitigated by the
// mandatory FLEET_COMMENT_HEADER provenance + downstream signer-fidelity validators (a fleet comment
// cannot forge a registry-derived alias). Test-only — the posted body keeps the original text.
const HOMOGLYPHS = new Map([[1072, 'a'], [1077, 'e'], [1086, 'o'], [1088, 'p'], [1089, 'c'], [1093, 'x'], [1091, 'y'], [1110, 'i'], [1112, 'j'], [1109, 's'], [1082, 'k'], [1085, 'h'], [1084, 'm'], [1090, 't'], [1074, 'b'], [1075, 'r'], [1281, 'd'], [1040, 'a'], [1045, 'e'], [1054, 'o'], [1056, 'p'], [1057, 'c'], [1061, 'x'], [1052, 'm'], [1053, 'h'], [1058, 't'], [1042, 'b'], [1050, 'k'], [1030, 'i'], [959, 'o'], [957, 'v'], [945, 'a'], [961, 'p'], [1010, 'c'], [917, 'e']]);
const foldForScan = (text) => text.normalize('NFKC').replace(/[\p{White_Space}\p{Cf}]/gu, '')
  .replace(/[^\u0000-\u007F]/g, (ch) => HOMOGLYPHS.get(ch.codePointAt(0)) || ch);

function validateGithubRead(args) {
  if (!GH_READ_KINDS.has(args.kind)) return { ok: false, reason: `github_read.kind must be issue|pr|repo` };
  if (args.kind !== 'repo' && !isPosInt(args.number)) return { ok: false, reason: 'github_read.number must be a positive integer' };
  return { ok: true };
}
function validateWikiSearch(args) {
  return nonEmptyStr(args.query) ? { ok: true } : { ok: false, reason: 'wiki_search.query must be a non-empty string' };
}
function validateRepoMap(args) {
  // repoMap() already rejects traversal + oversize/binary files per-path; the remaining gap is a huge
  // ARRAY of paths (CPU/IO scan-DoS), so cap the count here.
  if (!Array.isArray(args.paths) || !args.paths.every(nonEmptyStr)) {
    return { ok: false, reason: 'repo_map.paths must be an array of non-empty strings' };
  }
  if (args.paths.length > MAX_REPO_MAP_PATHS) {
    return { ok: false, reason: `repo_map.paths exceeds ${MAX_REPO_MAP_PATHS} (scan-DoS guard)` };
  }
  return { ok: true };
}
function validateSelfComment(args) {
  if (!isPosInt(args.issue)) return { ok: false, reason: 'github_self_comment.issue must be a positive integer' };
  if (!nonEmptyStr(args.body)) return { ok: false, reason: 'github_self_comment.body must be non-empty' };
  if (BATON_MARKERS.test(foldForScan(args.body))) return { ok: false, reason: 'github_self_comment.body may not impersonate a baton/governance artifact' };
  return { ok: true };
}

// Typed tool catalog. Each entry declares its permission class + an arg validator.
const CATALOG = {
  github_read: { perm: 'read', validate: validateGithubRead },
  wiki_search: { perm: 'read', validate: validateWikiSearch },
  repo_map: { perm: 'read', validate: validateRepoMap },
  github_self_comment: { perm: 'self-comment-write', validate: validateSelfComment },
};

// authorizeToolCall(name, args) -> { allowed, perm } | { allowed:false, reason }. Default-deny: an
// unknown tool, a not-allowed permission class, or malformed args are all refused before execution.
function authorizeToolCall(toolName, args = {}) {
  // own-property lookup so inherited members ('__proto__', 'constructor') are 'unknown', not matched.
  const tool = Object.prototype.hasOwnProperty.call(CATALOG, toolName) ? CATALOG[toolName] : null;
  if (!tool) return { allowed: false, reason: `unknown tool: ${toolName}` };
  if (!ALLOWED_PERMS.has(tool.perm)) return { allowed: false, reason: `permission class not allowed: ${tool.perm}` };
  const verdict = tool.validate(args || {});
  return verdict.ok ? { allowed: true, perm: tool.perm } : { allowed: false, reason: verdict.reason };
}

// Public catalog listing (name + permission class) for advertising tools to a fleet model.
function fleetToolCatalog() {
  return Object.keys(CATALOG).map((name) => ({ name, perm: CATALOG[name].perm }));
}

module.exports = { authorizeToolCall, fleetToolCatalog, CATALOG, ALLOWED_PERMS, BATON_MARKERS };
