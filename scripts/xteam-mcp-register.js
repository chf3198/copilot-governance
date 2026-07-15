#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const NAME = 'megingjord-xteam';
const VALID = ['copilot', 'codex', 'claude', 'antigravity', 'cursor', 'all'];

function usage() {
  console.error('Usage: xteam-mcp-register.js --target <copilot|codex|claude|antigravity|cursor|all> [--root <path>] [--apply]');
  process.exit(1);
}
function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
function readText(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function readJson(file) { const t = readText(file).trim(); return t ? JSON.parse(t) : {}; }
function tomlStr(v) { return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function entry(team, bin, withType) {
  const base = { command: 'node', args: [bin], env: { MEGINGJORD_XTEAM_TEAM: team } };
  return withType ? { type: 'stdio', ...base } : base;
}
function mergeJson(file, key, value, apply) {
  const obj = readJson(file);
  obj[key] = obj[key] || {};
  const before = JSON.stringify(obj[key][NAME] || null);
  obj[key][NAME] = value;
  const changed = before !== JSON.stringify(obj[key][NAME]);
  if (apply && changed) atomicWrite(file, `${JSON.stringify(obj, null, 2)}\n`);
  return changed;
}
function mergeCodex(file, bin, apply) {
  const block = `[mcp_servers.${NAME}]\ncommand = "node"\nargs = ["${tomlStr(bin)}"]\nenv = { MEGINGJORD_XTEAM_TEAM = "codex" }\n`;
  const src = readText(file);
  const re = new RegExp(`\\[mcp_servers\\.${NAME.replace(/-/g, '\\-')}\\][\\s\\S]*?(?=\\n\\[[^\\]]+\\]|$)`);
  const found = src.match(re);
  const out = found ? src.replace(re, block.trimEnd()) : `${src.trimEnd()}${src.trimEnd() ? '\n\n' : ''}${block}`;
  const changed = src !== out;
  if (apply && changed) atomicWrite(file, out.endsWith('\n') ? out : `${out}\n`);
  return changed;
}

const args = process.argv.slice(2);
let target = 'all';
let root = process.cwd();
let apply = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--target') target = args[++i] || '';
  else if (args[i] === '--root') root = args[++i] || '';
  else if (args[i] === '--apply') apply = true;
  else usage();
}
if (!VALID.includes(target) || !root) usage();
const home = process.env.MCP_REGISTER_TEST_HOME || os.homedir();
const bin = path.resolve(root, 'scripts/xteam-mcp/bin.js');
if (!fs.existsSync(bin)) { console.error(`Missing xteam MCP entrypoint: ${bin}`); process.exit(1); }

const jobs = {
  copilot: () => mergeJson(path.join(home, '.config/Code/User/mcp.json'), 'servers', entry('copilot', bin, false), apply),
  claude: () => mergeJson(path.join(home, '.claude.json'), 'mcpServers', entry('claude-code', bin, true), apply),
  antigravity: () => mergeJson(path.join(home, '.config/Antigravity/User/mcp.json'), 'servers', entry('antigravity', bin, false), apply),
  cursor: () => mergeJson(path.join(home, '.cursor/mcp.json'), 'mcpServers', entry('cursor', bin, false), apply),
  codex: () => mergeCodex(path.join(home, '.codex/config.toml'), bin, apply),
};
const order = target === 'all' ? ['copilot', 'codex', 'claude', 'antigravity', 'cursor'] : [target];
const failures = [];
for (const t of order) {
  try {
    const changed = jobs[t]();
    const verb = apply ? (changed ? 'updated' : 'no-op') : (changed ? 'would update' : 'would no-op');
    console.log(`${t}: ${verb}`);
  } catch (err) {
    failures.push(`${t}: ${(err && err.message) || String(err)}`);
    console.error(`${t}: failed`);
  }
}
if (failures.length) {
  console.error('Registration failures:\n- ' + failures.join('\n- '));
  process.exit(1);
}
