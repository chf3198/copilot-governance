#!/usr/bin/env node
'use strict';
// tier: 3
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const lib = require('./consultant-checks-lib');
const batonGov = require('./baton-artifact-governance');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const dryRun = args.includes('--dry-run');
const issue = +(args[args.indexOf('--issue') + 1] || 0);
const root = path.resolve(__dirname, '..', '..');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const id = (domain, num) => `${domain}-${String(num).padStart(3, '0')}`;

const run = cmd => {
  try { return cp.execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch { return ''; }
};
const exists = p => fs.existsSync(path.join(root, p));
const read = p => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } };
const ok = (id, domain, pass, evidence, finding, suggestedFix) => ({
  id, domain, status: pass ? 'PASS' : 'FAIL', evidence, finding, suggestedFix
});
const skip = (id, domain, why) => ({
  id, domain, status: 'SKIP', evidence: why, finding: 'insufficient-context', suggestedFix: 'run with full telemetry context'
});

const checks = [
  [id('gov', 1), 'governance', () => {
    if (!issue) return skip(id('gov', 1), 'governance', 'missing --issue');
    const labels = run(`gh issue view ${issue} --json labels -q '.labels[].name'`);
    const pass = /type:/.test(labels) && /status:/.test(labels) && /priority:/.test(labels) && /area:/.test(labels);
    return ok(id('gov', 1), 'governance', pass, labels || 'no-label-output', pass ? 'labels-complete' : 'labels-missing', 'apply required labels');
  }],
  [id('gov', 2), 'governance', () => {
    if (!issue) return skip(id('gov', 2), 'governance', 'missing --issue');
    const comments = run(`gh issue view ${issue} --json comments -q '.comments[].body'`);
    const pass = lib.decideGov002(comments);
    return ok(id('gov', 2), 'governance', pass, pass ? 'all baton artifacts present' : 'missing baton artifact', pass ? 'artifact-complete' : 'artifact-gap', 'post missing baton artifacts');
  }],
  [id('gov', 3), 'governance', () => {
    const fleetLog = lib.readWithMainFallback({ fs, path, run, cwdRoot: root, relPath: 'logs/fleet-health.jsonl' });
    const eventLog = lib.readWithMainFallback({ fs, path, run, cwdRoot: root, relPath: '.dashboard/events.jsonl' });
    const pass = lib.decideGov003(fleetLog, eventLog);
    const evidence = pass ? 'fleet-health or dashboard baton events present' : 'no baton markers in fleet-health/events log';
    return ok(id('gov', 3), 'governance', pass, evidence, 'event-coverage-check', 'emit baton events');
  }],
  [id('gov', 4), 'governance', () => { const gitLog = run("git log --oneline -99"); const matchCount = (gitLog.match(/#\d+/g) || []).length; const total = gitLog ? gitLog.split('\n').length : 0; return ok(id('gov', 4), 'governance', total > 0 && matchCount / total >= 0.8, `${matchCount}/${total} commit refs`, 'commit-issue-linkage', 'reference issue numbers in commits'); }],
  [id('gov', 5), 'governance', () => issue ? ok(id('gov', 5), 'governance', lib.decideGov005(run(`gh issue view ${issue}`)), 'issue body checklist scanned', 'ac-evidence-completeness', 'complete unchecked ACs') : skip(id('gov', 5), 'governance', 'missing --issue')],
  [id('gov', 6), 'governance', () => {
    const branch = run('git branch --show-current');
    // #1615: issue-only lanes (docs-research, trivial, Epic closeouts) run from
    // main — branch-naming does not apply; skip instead of false-positive FAIL.
    if (issue) {
      const labels = run(`gh issue view ${issue} --json labels -q '.labels[].name'`);
      if (lib.isIssueOnlyLane(labels)) return skip(id('gov', 6), 'governance', `issue-only lane (${branch}) — branch-name check not enforced`);
    }
    return ok(id('gov', 6), 'governance', /^(feat|fix|skill|hook)\//.test(branch), branch || 'unknown-branch', 'branch-naming', 'use approved branch prefix');
  }],
  [id('gov', 7), 'governance', () => {
    if (!issue) return skip(id('gov', 7), 'governance', 'missing --issue');
    let comments = [];
    try { comments = JSON.parse(run(`gh issue view ${issue} --json comments`)).comments || []; }
    catch {}
    const result = batonGov.analyzeComments(comments);
    const first = result.violations[0];
    return ok(
      id('gov', 7), 'governance', result.ok,
      result.ok ? `${result.count} baton artifact comments validated` : `${first?.artifact || 'artifact'} ${first?.rule || 'unknown'}`,
      'signer-role-consistency',
      first?.remediation?.suggestedFix ||
        'rebuild artifact via baton-comment-build.js or agent-signature.js and correct role fields'
    );
  }],
  [id('tool', 1), 'tools', () => ok(id('tool', 1), 'tools', exists('wiki/index.md') && exists('wiki/log.md'), 'wiki index/log presence', 'wiki-growth-ready', 'maintain wiki index/log updates')],
  [id('tool', 2), 'tools', () => ok(id('tool', 2), 'tools', !/\[\[[^\]]+\]\].*\(not found\)/.test(run('npm run wiki:lint 2>&1 | cat')), 'wiki lint output scanned', 'wiki-orphan-check', 'add backlinks/cross-links')],
  [id('tool', 3), 'tools', () => ok(id('tool', 3), 'tools', /All files within 100-line/.test(run('npm run lint 2>&1 | cat')), 'lint output scanned', 'lint-clean', 'reduce file length or split files')],
  [id('tool', 4), 'tools', () => exists('playwright-report/index.html') ? ok(id('tool', 4), 'tools', true, 'playwright report present', 'playwright-utilization', 'run visual QA when UI files change') : skip(id('tool', 4), 'tools', 'no playwright report available')],
  [id('tool', 5), 'tools', () => ok(id('tool', 5), 'tools', !run("grep -Rn '\t|  $' dashboard scripts | head -1"), 'whitespace scan completed', 'prettification-compliance', 'normalize indentation and trailing spaces')],
  [id('fleet', 1), 'fleet', () => exists('logs/model-routing-telemetry.jsonl') ? ok(id('fleet', 1), 'fleet', !/\b[0-9]{3}\b/.test(read('logs/model-routing-telemetry.jsonl')), 'telemetry scanned for HTTP 3xx/4xx/5xx', 'rate-limit-event-frequency', 'enable backoff/circuit-breaker') : skip(id('fleet', 1), 'fleet', 'missing routing telemetry')],
  [id('fleet', 2), 'fleet', () => exists('logs/model-routing-weekly.json') ? ok(id('fleet', 2), 'fleet', true, 'weekly cost file present', 'cost-budget-adherence', 'enforce monthly budget threshold') : skip(id('fleet', 2), 'fleet', 'missing weekly cost report')],
  [id('fleet', 3), 'fleet', () => {
    if (!exists('logs/model-routing-telemetry.jsonl')) return skip(id('fleet', 3), 'fleet', 'missing routing telemetry');
    const telemetry = read('logs/model-routing-telemetry.jsonl');
    const pass = /provider":"ollama/.test(telemetry) || /"lane":"fleet"/.test(telemetry);
    return ok(id('fleet', 3), 'fleet', pass, 'provider/lane mix scanned', 'local-llm-utilization', 'route free-tier work to local ollama');
  }],
  [id('fleet', 4), 'fleet', () => exists('logs/model-routing-telemetry.jsonl') ? ok(id('fleet', 4), 'fleet', Date.now() - fs.statSync(path.join(root, 'logs/model-routing-telemetry.jsonl')).mtimeMs < ONE_DAY_MS, 'telemetry freshness checked', 'telemetry-freshness', 'refresh telemetry daily') : skip(id('fleet', 4), 'fleet', 'missing routing telemetry')],
  // #2136: surface precedence_verdict from closeout rubric JSON (priority_weights_v1 G1>...>G10)
  [id('rubric', 1), 'rubric', () => {
    if (!issue) return skip(id('rubric', 1), 'rubric', 'missing --issue');
    const body = run(`gh issue view ${issue} --json comments -q '[.comments[].body]|add'`);
    const match = body.match(/"precedence_verdict"\s*:\s*"([^"]+)"/);
    if (!match) return ok(id('rubric', 1), 'rubric', true, 'precedence_verdict absent — legacy-unscored', 'rubric-precedence', 'run rubric-score.js v3 to produce precedence_verdict');
    const verdict = match[1];
    return ok(id('rubric', 1), 'rubric', verdict !== 'fail', `precedence_verdict=${verdict}`, verdict === 'pass' ? 'rubric-precedence-pass' : 'rubric-precedence-fail', 'review goal scores weighted by G1>...>G10 priority');
  }],
];

const results = dryRun ? checks.map(([id, domain]) => skip(id, domain, 'dry-run')) : checks.map(([, , fn]) => fn());
if (asJson) console.log(JSON.stringify(results, null, 2));
else results.forEach(r => console.log(`${r.id} [${r.domain}] ${r.status} :: ${r.finding}`));
process.exit(results.some(r => r.status === 'FAIL') ? 1 : 0);
