#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseActiveProfile, readSchema } = require('./authorization-profile');
const { buildMetadata } = require('./authorization-profile-context');

const TELEMETRY_FILE = path.join(process.env.HOME || '/tmp', '.megingjord', 'authorization-audit.jsonl');

function emitAuditLog(executionId, operation, decision, profile) {
  const entry = {
    timestamp: new Date().toISOString(),
    execution_id: executionId,
    operation,
    decision,
    profile_active: profile.profile,
    profile_source: profile.source,
    capabilities_active: profile.capabilities,
  };
  const dir = path.dirname(TELEMETRY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(TELEMETRY_FILE, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

function readAuditLogs() {
  if (!fs.existsSync(TELEMETRY_FILE)) return [];
  return fs.readFileSync(TELEMETRY_FILE, 'utf8')
    .split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function canExecuteOperation(profile, operation) {
  const caps = profile.capabilities;
  const gateMap = {
    install: caps.install,
    upgrade: caps.upgrade,
    privileged: caps.privileged,
    execute_local: caps.execute_local,
    execute_remote: caps.execute_remote,
  };
  return gateMap[operation] ?? false;
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const operation = args[args.indexOf('--operation') + 1] || 'execute_local';
  const executionId = args[args.indexOf('--exec-id') + 1] || `exec-${Date.now()}`;

  try {
    const schema = readSchema();
    const profile = parseActiveProfile({ schema });
    const allowed = canExecuteOperation(profile, operation);
    const decision = allowed ? 'ALLOW' : 'DENY';
    const entry = emitAuditLog(executionId, operation, decision, profile);

    if (asJson) {
      process.stdout.write(JSON.stringify({ operation, decision, entry }, null, 2) + '\n');
    } else {
      process.stdout.write(`Operation: ${operation}\nDecision: ${decision}\nProfile: ${profile.profile}\n`);
    }
    process.exit(allowed ? 0 : 1);
  } catch (e) {
    process.stderr.write(`authorization-audit: ${e.message}\n`);
    process.exit(2);
  }
}

module.exports = { emitAuditLog, readAuditLogs, canExecuteOperation, TELEMETRY_FILE };
if (require.main === module) main();
