#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

const homes = {
  copilot: process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot'),
  codex: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
};
const paths = {
  copilot: path.join(homes.copilot, 'hooks', 'repo-scope.json'),
  codex: path.join(homes.codex, 'devenv-ops', 'repo-scope.json'),
};

function loadCfg(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { default_enabled: false, enabled_repos: [] };
  }
}

function saveCfg(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

function norm(p) { return path.resolve(p); }

function main() {
  const args = process.argv.slice(2);
  const targetArg = args.find((x) => x.startsWith('--target=')) || '';
  const target = (targetArg.split('=')[1] || 'both').toLowerCase();
  const [cmd, arg] = args.filter((x) => !x.startsWith('--target='));
  const targets = target === 'both' ? ['copilot', 'codex'] : [target];
  if (!targets.every((x) => paths[x])) throw new Error('Invalid target. Use copilot, codex, or both.');

  if (cmd === 'list') {
    console.log(JSON.stringify(Object.fromEntries(
      targets.map((name) => [name, loadCfg(paths[name])])), null, 2));
    return;
  }
  const configs = Object.fromEntries(targets.map((name) => [name, loadCfg(paths[name])]));
  for (const cfg of Object.values(configs)) {
    cfg.enabled_repos = Array.isArray(cfg.enabled_repos) ? cfg.enabled_repos : [];
  }
  if (cmd === 'enable') {
    if (!arg) throw new Error('Missing repo path. Usage: repo-scope enable /abs/path');
    const p = norm(arg);
    for (const name of targets) {
      const cfg = configs[name];
      if (!cfg.enabled_repos.includes(p)) cfg.enabled_repos.push(p);
      saveCfg(paths[name], cfg);
    }
    console.log(`Enabled workflow for: ${p} (${targets.join(', ')})`);
    return;
  }
  if (cmd === 'disable') {
    if (!arg) throw new Error('Missing repo path. Usage: repo-scope disable /abs/path');
    const p = norm(arg);
    for (const name of targets) {
      const cfg = configs[name];
      cfg.enabled_repos = cfg.enabled_repos.filter((x) => x !== p);
      saveCfg(paths[name], cfg);
    }
    console.log(`Disabled workflow for: ${p} (${targets.join(', ')})`);
    return;
  }
  if (cmd === 'default-on' || cmd === 'default-off') {
    for (const name of targets) {
      configs[name].default_enabled = cmd === 'default-on';
      saveCfg(paths[name], configs[name]);
    }
    console.log(`Default set to: ${cmd === 'default-on'} (${targets.join(', ')})`);
    return;
  }

  console.log('Usage: repo-scope <list|enable|disable|default-on|default-off> [repoPath] [--target=copilot|codex|both]');
  process.exit(2);
}

try { main(); } catch (err) {
  console.error(err.message);
  process.exit(1);
}
