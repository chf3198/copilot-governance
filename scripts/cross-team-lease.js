#!/usr/bin/env node
'use strict';
// cross-team-lease.js — wraps cross-team-lease-registry with CLI surface +
// optional GitHub comment posting. Per #1997: comment posting routes through
// github-dispatcher.js execute() (MCP-first with gh-CLI fallback); selection
// controlled by MEGINGJORD_MCP_DISABLED env per #1629 contract.

const leaseRegistry = require('./cross-team-lease-registry');
const { execute } = require('./github-dispatcher');

function parse(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) out[arg.slice(2).replace(/-/g, '_')] = args[++i] || true;
    else out._.push(arg);
  }
  return out;
}

async function post(issue, body, opts = {}) {
  const res = await execute('add-comment', { issue: String(issue), body }, opts);
  if (!res.ok) {
    throw new Error(
      `add-comment failed via ${res.provider || 'dispatcher'}: ${res.error || res.reason || 'unknown'}`,
    );
  }
  return res;
}

async function run(argv = process.argv.slice(2), opts = {}) {
  const args = parse(argv);
  const cmd = args._[0];
  const file = args.file || leaseRegistry.DEFAULT_PATH;
  const commands = {
    create: (registry) => leaseRegistry.createLease(registry, args),
    refresh: (registry) => leaseRegistry.refreshLease(registry, args.ticket, args.ttl_hours),
    expire: (registry) => leaseRegistry.expireLeases(registry),
    close: (registry) => leaseRegistry.closeLease(registry, args.ticket),
    list: (registry) => leaseRegistry.active(registry),
  };
  if (!commands[cmd]) throw new Error('usage: create|refresh|expire|close|list');
  if (cmd === 'list') {
    const registry = leaseRegistry.read(file);
    const result = commands.list(registry);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  const result = leaseRegistry.mutateRegistry(file, (registry) => commands[cmd](registry));
  if (args.post_comment && result && !Array.isArray(result)) {
    await post(result.ticket, leaseRegistry.commentBlock(cmd, result), opts);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (require.main === module) {
  run().catch((error) => { console.error(error.message); process.exit(1); });
}

module.exports = { run, parse, post };
