#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const leaseRegistry = require('./cross-team-lease-registry');

const SENSITIVE = ['.github/workflows', 'hooks', 'instructions', 'skills', 'scripts/global'];

function parse(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) out[arg.slice(2).replace(/-/g, '_')] = args[++i] || true;
    else out._.push(arg);
  }
  return out;
}

function csv(value) {
  return value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : [];
}

function overlaps(a, b) {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function surface(path) {
  return SENSITIVE.find(prefix => overlaps(path, prefix)) || null;
}

function note(kind, lease, detail, override) {
  return { kind: override && kind === 'block' ? 'warn' : kind, ticket: lease.ticket,
    branch: lease.branch, team: lease.team, detail };
}

function evaluate(registry, input) {
  const paths = csv(input.paths);
  const branch = input.branch || '';
  const ticket = Number(input.ticket || 0);
  const override = Boolean(input.manager_override);
  const findings = [];
  for (const lease of leaseRegistry.active(registry)) {
    if (lease.ticket === ticket && lease.branch === branch) continue;
    if (branch && lease.branch === branch) {
      findings.push(note('block', lease, `branch already claimed: ${branch}`, override));
    }
    for (const requestedPath of paths) {
      const hit = (lease.paths || []).find(existing => overlaps(requestedPath, existing));
      if (hit && lease.ticket === ticket) {
        findings.push(note('block', lease, `same-ticket path collision: ${requestedPath} vs ${hit}`, override));
      } else if (hit && lease.ticket !== ticket) {
        findings.push(note('warn', lease, `path already claimed by #${lease.ticket}: ${requestedPath} vs ${hit}`));
      } else {
        const ours = surface(requestedPath);
        const theirs = (lease.paths || []).map(surface).find(Boolean);
        if (ours && theirs && ours !== theirs) {
          findings.push(note('warn', lease, `adjacent governance surface: ${ours} near ${theirs}`));
        }
      }
    }
  }
  return { ok: !findings.some(f => f.kind === 'block'), findings };
}

function commentBlock(issue, result) {
  const rows = ['<!-- cross-team-conflict:pull -->', 'CROSS_TEAM_CONFLICT_PULL',
    `ticket: #${issue}`, `status: ${result.ok ? 'clear' : 'blocked'}`];
  for (const finding of result.findings) rows.push(`${finding.kind}: #${finding.ticket} ${finding.detail}`);
  return rows.join('\n');
}

function post(issue, body) {
  execFileSync('gh', ['issue', 'comment', String(issue), '--body', body], { stdio: 'inherit' });
}

function run(argv = process.argv.slice(2)) {
  const args = parse(argv);
  const registry = leaseRegistry.read(args.file || leaseRegistry.DEFAULT_PATH);
  leaseRegistry.expireLeases(registry);
  const result = evaluate(registry, args);
  if (args.post_comment) post(args.ticket, commentBlock(args.ticket, result));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 2;
}

if (require.main === module) {
  try { process.exit(run()); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { evaluate, commentBlock, parse, run };
