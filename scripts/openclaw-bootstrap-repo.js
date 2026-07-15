#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');

const os = require('os');

const repoPath = path.resolve(process.argv[2] || process.cwd());
const mode = process.argv[3] || 'init';
const globalBootstrap = path.join(os.homedir(), '.copilot', 'scripts', 'global-skills-bootstrap-repo.js');

const result = spawnSync('node', [globalBootstrap, repoPath, mode], { stdio: 'inherit' });
process.exit(result.status || 0);
