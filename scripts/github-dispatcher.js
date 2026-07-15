'use strict';
// MCP-vs-gh-CLI dispatcher. Falls back to gh CLI when MCP is unavailable.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
function provider(env = process.env) {
  if (env.MEGINGJORD_MCP_DISABLED === '1') return 'gh-cli';
  if (env.MEGINGJORD_MCP_FORCE_AVAILABLE === '1') return 'mcp';
  return env.MEGINGJORD_MCP_AVAILABLE === '1' ? 'mcp' : 'gh-cli';
}
const TOOL_MAP = {
  'create-issue': { mcp: 'mcp__github__create_issue', cli: 'gh issue create' },
  'add-comment': { mcp: 'mcp__github__create_issue_comment', cli: 'gh issue comment' },
  'get-issue': { mcp: 'mcp__github__get_issue', cli: 'gh issue view' },
  'list-issues': { mcp: 'mcp__github__list_issues', cli: 'gh issue list' },
  'update-issue': { mcp: 'mcp__github__update_issue', cli: 'gh issue edit' },
  'get-pull-request': { mcp: 'mcp__github__get_pull_request', cli: 'gh pr view' },
  'set-labels': { mcp: 'mcp__github__update_issue', cli: 'gh api PUT labels' },
  'update-project-v2-item-field': {
    mcp: 'mcp__github__update_project_v2_item_field_value', cli: 'gh api graphql -f query=...',
  },
};
const CLI_ARGS = {
  'create-issue': ['issue', 'create'], 'add-comment': ['issue', 'comment'],
  'get-issue': ['issue', 'view'], 'list-issues': ['issue', 'list'],
  'update-issue': ['issue', 'edit'], 'get-pull-request': ['pr', 'view'],
};
function toolName(op, prov) { return TOOL_MAP[op] ? (prov === 'mcp' ? TOOL_MAP[op].mcp : TOOL_MAP[op].cli) : null; }
function cliArgs(op) { return CLI_ARGS[op] || null; }
function buildCliArgs(op, p = {}) {
  const base = cliArgs(op);
  if (!base) return null;
  const args = [...base];
  if (p.issue !== undefined) args.push(String(p.issue));
  if (p.title) args.push('--title', p.title);
  if (p.body) args.push('--body', p.body);
  if (Array.isArray(p.labels)) for (const l of p.labels) args.push('--label', l);
  if (p.label) args.push('--add-label', p.label);
  if (p.json) args.push('--json', p.json);
  return args;
}
async function executeViaCli(op, p = {}, runner = execFileAsync) {
  const args = buildCliArgs(op, p);
  if (!args) return { ok: false, reason: `unknown-cli-operation:${op}` };
  try {
    const r = await runner('gh', args);
    return { ok: true, provider: 'gh-cli', stdout: r.stdout, stderr: r.stderr };
  } catch (e) { return { ok: false, provider: 'gh-cli', error: e.message }; }
}
async function executeSetLabels(p, runner = execFileAsync) {
  let repo = p.repo;
  if (!repo) {
    try {
      const r = await runner('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
      repo = r.stdout.trim();
    } catch (e) { return { ok: false, provider: 'gh-cli', error: `repo-lookup: ${e.message}` }; }
  }
  try {
    const r = await runner('gh', [
      'api', `repos/${repo}/issues/${p.issue}/labels`, '-X', 'PUT', '--input', '-',
    ], { input: JSON.stringify({ labels: p.labels || [] }) });
    return { ok: true, provider: 'gh-cli', stdout: r.stdout, stderr: r.stderr };
  } catch (e) { return { ok: false, provider: 'gh-cli', error: e.message }; }
}
async function executeViaMcp(op, p = {}, mcpClient) {
  if (!mcpClient || typeof mcpClient.invoke !== 'function') return { ok: false, reason: 'mcp-client-required', operation: op };
  const tool = toolName(op, 'mcp');
  if (!tool) return { ok: false, reason: `unknown-mcp-operation:${op}` };
  try { return { ok: true, provider: 'mcp', tool, result: await mcpClient.invoke(tool, p) }; }
  catch (e) { return { ok: false, provider: 'mcp', tool, error: e.message }; }
}
async function execute(op, p = {}, opts = {}) {
  const { env = process.env, mcpClient = null, cliRunner = execFileAsync } = opts;
  if (provider(env) === 'mcp') {
    const r = await executeViaMcp(op, p, mcpClient);
    if (r.ok) return r;
  }
  if (op === 'set-labels') return executeSetLabels(p, cliRunner);
  return executeViaCli(op, p, cliRunner);
}
function dispatch(op, env = process.env) {
  const prov = provider(env);
  const tool = toolName(op, prov);
  return { provider: prov, tool, ok: tool !== null };
}
module.exports = {
  provider, toolName, dispatch, cliArgs, buildCliArgs,
  executeViaCli, executeSetLabels, executeViaMcp, execute,
};
