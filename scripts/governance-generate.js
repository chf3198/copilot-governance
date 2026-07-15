#!/usr/bin/env node
'use strict';

const path = require('path');
const { readFileSync, mkdirSync, rmSync } = require('fs');
const { validate } = require('./governance-manifest-validate');
const { emit } = require('./governance-adapter-emit');

const root = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(root, 'inventory', 'governance-manifest.sample.json');
const outRoot = path.join(root, 'generated', 'governance-adapters');

function main() {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const errors = validate(manifest);
    if (errors.length) throw new Error(errors.join('; '));
    rmSync(outRoot, { recursive: true, force: true });
    mkdirSync(outRoot, { recursive: true });
    const outputs = emit(manifestPath, outRoot);
    process.stdout.write(`governance-generate: wrote ${outputs.length} files\n`);
  } catch (e) {
    process.stderr.write(`governance-generate: ${e.message}\n`);
    process.exit(2);
  }
}

if (require.main === module) main();
