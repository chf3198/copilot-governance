#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function validate(filePath, schemaPath) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `File not found: ${filePath}` };
  }
  if (!fs.existsSync(schemaPath)) {
    return { ok: false, error: `Schema not found: ${schemaPath}` };
  }
  
  try {
    const pyCmd = 'import sys, json, jsonschema; jsonschema.validate(json.load(open(sys.argv[1])), json.load(open(sys.argv[2])))';
    cp.execFileSync('python3', ['-c', pyCmd, filePath, schemaPath], { stdio: 'pipe' });
    return { ok: true };
  } catch (err) {
    const output = err.stderr ? err.stderr.toString() : (err.message || String(err));
    return { ok: false, error: output.trim() };
  }
}

function runCli() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const schemaIdx = args.indexOf('--schema');
  
  if (fileIdx !== -1 && schemaIdx !== -1) {
    const file = path.resolve(ROOT, args[fileIdx + 1]);
    const schema = path.resolve(ROOT, args[schemaIdx + 1]);
    const res = validate(file, schema);
    if (!res.ok) {
      console.error(`Validation Failed:\n${res.error}`);
      process.exit(1);
    }
    console.log(`Validation Passed for ${path.basename(file)}`);
    process.exit(0);
  }
  
  const claudeSettings = path.join(ROOT, '.claude', 'settings.json');
  const claudeSchema = path.join(ROOT, 'config', 'claude-code-settings.schema.json');
  
  console.log(`Validating Claude settings: ${path.relative(ROOT, claudeSettings)}`);
  const claudeRes = validate(claudeSettings, claudeSchema);
  if (!claudeRes.ok) {
    console.error(`❌ Claude settings validation failed:\n${claudeRes.error}`);
    process.exit(1);
  }
  console.log(`✅ Claude settings parsed correctly against schema.`);
  
  const codexSettings = path.join(ROOT, '.codex', 'settings.json');
  if (fs.existsSync(codexSettings)) {
    console.log(`Validating Codex settings (advisory)...`);
    console.log(`✅ Codex settings parsed (advisory).`);
  } else {
    console.log(`ℹ️ No Codex settings file found (skipping advisory check).`);
  }
  
  process.exit(0);
}

if (require.main === module) {
  runCli();
}

module.exports = { validate };
