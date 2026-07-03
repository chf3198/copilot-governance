#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const VALID = ['copilot', 'codex', 'claude', 'all'];
const NAME = 'tavily';

function usage() {
  console.error('Usage: tavily-mcp-register.js --target <copilot|codex|claude|all> [--apply]');
  process.exit(1);
}
function readText(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function readJson(file) { const text = readText(file).trim(); return text ? JSON.parse(text) : {}; }
function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${Date.now()}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
function mergeJson(file, key, value, apply) {
  const obj = readJson(file); obj[key] = obj[key] || {};
  const before = JSON.stringify(obj[key][NAME] || null);
  obj[key][NAME] = value;
  const changed = before !== JSON.stringify(obj[key][NAME]);
  if (apply && changed) write(file, `${JSON.stringify(obj, null, 2)}\n`);
  return changed;
}
function mergeCodex(file, apply) {
  const block = `[mcp_servers.tavily]\nurl = "https://mcp.tavily.com/mcp/"\nbearer_token_env_var = "TAVILY_API_KEY"\n`;
  const src = readText(file);
  const re = /\[mcp_servers\.tavily\][\s\S]*?(?=\n\[[^\]]+\]|$)/;
  const out = re.test(src) ? src.replace(re, block.trimEnd()) : `${src.trimEnd()}${src.trimEnd() ? '\n\n' : ''}${block}`;
  const changed = src !== out;
  if (apply && changed) write(file, out.endsWith('\n') ? out : `${out}\n`);
  return changed;
}

function runCli(argv = process.argv.slice(2), home = process.env.MCP_REGISTER_TEST_HOME || os.homedir()) {
  let target = 'all';
  const apply = argv.includes('--apply');
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--target') target = argv[++i] || '';
  if (!VALID.includes(target)) usage();
  const jobs = {
    copilot: () => mergeJson(path.join(home, '.config/Code/User/mcp.json'), 'servers', {
      url: 'https://mcp.tavily.com/mcp/', auth: { type: 'oauth' }, bearerTokenEnvVar: 'TAVILY_API_KEY',
    }, apply),
    claude: () => mergeJson(path.join(home, '.claude.json'), 'mcpServers', { type: 'http', url: 'https://mcp.tavily.com/mcp/', bearerTokenEnvVar: 'TAVILY_API_KEY' }, apply),
    codex: () => mergeCodex(path.join(home, '.codex/config.toml'), apply),
  };
  const order = target === 'all' ? ['copilot', 'codex', 'claude'] : [target];
  let failed = false;
  for (const targetName of order) {
    try {
      const changed = jobs[targetName]();
      console.log(`${targetName}: ${apply ? (changed ? 'updated' : 'no-op') : (changed ? 'would update' : 'would no-op')}`);
    } catch (err) {
      failed = true;
      console.error(`${targetName}: failed: ${(err && err.message) || String(err)}`);
    }
  }
  return failed ? 1 : 0;
}

module.exports = { runCli };
if (require.main === module) process.exit(runCli());
