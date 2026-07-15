#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function scan(root = path.resolve(__dirname, '..', '..')) {
  const issues = [];
  const envExample = read(path.join(root, '.env.example'));
  const runtime = read(path.join(root, '.codex', 'runtime.config.toml'));
  if (!/^TAVILY_API_KEY=/m.test(envExample)) issues.push('.env.example: missing TAVILY_API_KEY template');
  if (!/^TAVILY_MCP_BASE_URL=https:\/\/mcp\.tavily\.com\/mcp\/$/m.test(envExample)) issues.push('.env.example: TAVILY_MCP_BASE_URL must be the static MCP base URL');
  if (!/\[mcp_servers\.tavily\]/.test(runtime)) issues.push('.codex/runtime.config.toml: missing Tavily MCP server block');
  if (!/bearer_token_env_var\s*=\s*"TAVILY_API_KEY"/.test(runtime)) issues.push('.codex/runtime.config.toml: Tavily must use bearer_token_env_var = "TAVILY_API_KEY"');
  if (/tavilyApiKey=|tvly-[A-Za-z0-9_-]+/i.test(runtime)) issues.push('.codex/runtime.config.toml: inline Tavily credentials are forbidden');
  if (!/url\s*=\s*"https:\/\/mcp\.tavily\.com\/mcp\/"/.test(runtime)) issues.push('.codex/runtime.config.toml: Tavily URL must stay on the static MCP base URL');
  return { ok: issues.length === 0, issues };
}

if (require.main === module) {
  const result = scan();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log('credentials-env-guard: PASS');
  else result.issues.forEach((issue) => console.error(issue));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { scan };
