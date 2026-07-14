#!/usr/bin/env node
'use strict';

// enforcement-wiring-audit (#3802, E1) — detect "reconciled-to-done but never enforced" validators.
//
// #1893 validator-discipline proves every validator ships a spec + self-test registry entry. It does
// NOT prove a validator is ever *invoked* by an enforced path. A validator can satisfy discipline yet
// be dead code: present in the tree but wired into no CI workflow, git hook, or self-test regression.
// That is the §4.iii failure class — guardrails "reconciled to done" that never actually enforce.
//
// This audit inventories every non-spec `scripts/*.js` validator and classifies each as ENFORCED or
// UNWIRED by REACHABILITY from an *enforced root*:
//   • a `.github/workflows/*.yml` job step,
//   • a `.github/scripts/*.sh` / `.githooks/*` hook script,
//   • an `inventory/harness-self-test-registry.json` entry.
// A root "references" a script by naming `scripts/<name>.js` or `scripts/<name>.spec.js`, or (registry)
// by its `name` field. Reachability then flows forward through `require('./x')` edges found in both the
// referenced validator and its sibling spec — so a helper pulled in only by an enforced spec still
// counts as enforced. UNWIRED = reachable from no enforced root.
//
// Advisory-first (§3g): the CLI prints the UNWIRED burndown and exits 0. Promote to a hard block only
// after a low-FP soak. Hermetic: Node built-ins only; no network, no `gh`, no untracked deps.

const fs = require('fs');
const path = require('path');

const SCRIPT_REF_RE = /scripts\/([a-z0-9][a-z0-9-]*)(?:\.spec)?\.js\b/g;
// Tolerate an optional `.js` extension in the require specifier — Node accepts both
// require('./x') and require('./x.js'), and enforced specs in this repo use both forms.
const REQUIRE_RE = /require\(\s*['"]\.\/([a-z0-9][a-z0-9-]*)(?:\.spec)?(?:\.js)?['"]\s*\)/g;

function readIf(p) {
  try {
    return fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : '';
  } catch (_) {
    return '';
  }
}

function listFiles(dir, ext) {
  let out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.endsWith(ext)) out.push(full);
  }
  return out;
}

// All non-spec validators under scripts/ (basenames, sorted).
function collectValidators(scriptsDir) {
  return listFiles(scriptsDir, '.js')
    .map(f => path.basename(f, '.js'))
    .filter(n => !n.endsWith('.spec'))
    .sort();
}

// Script basenames named as scripts/<name>[.spec].js inside a blob of text.
function scriptRefsIn(txt) {
  const names = new Set();
  for (const m of txt.matchAll(SCRIPT_REF_RE)) names.add(m[1]);
  return names;
}

// Outgoing edges from scripts/<base>.js and scripts/<base>.spec.js — a base "uses" another script if
// it `require('./x')`s it OR names `scripts/x.js` as a path string (e.g. spawnSync('node',
// ['scripts/x.js'])). Scanning path strings in reached bodies (not just enforced roots) catches
// child_process-style invocation, so a validator exercised by an enforced spec via spawn is ENFORCED.
function requireEdges(scriptsDir, base) {
  const edges = new Set();
  for (const suffix of ['.js', '.spec.js']) {
    const txt = readIf(path.join(scriptsDir, base + suffix));
    for (const m of txt.matchAll(REQUIRE_RE)) edges.add(m[1]);
    for (const n of scriptRefsIn(txt)) if (n !== base) edges.add(n);
  }
  return [...edges];
}

// Enumerate enforced roots with their referenced script basenames + provenance.
function collectRoots(root) {
  const roots = [];
  const add = (kind, file, names) => {
    if (names.size) roots.push({ kind, file, names: [...names].sort() });
  };

  for (const wf of listFiles(path.join(root, '.github', 'workflows'), '.yml')) {
    add('workflow', path.relative(root, wf), scriptRefsIn(readIf(wf)));
  }
  for (const wf of listFiles(path.join(root, '.github', 'workflows'), '.yaml')) {
    add('workflow', path.relative(root, wf), scriptRefsIn(readIf(wf)));
  }
  for (const sh of listFiles(path.join(root, '.github', 'scripts'), '.sh')) {
    add('hook-script', path.relative(root, sh), scriptRefsIn(readIf(sh)));
  }
  for (const hk of listFiles(path.join(root, '.githooks'), '')) {
    add('git-hook', path.relative(root, hk), scriptRefsIn(readIf(hk)));
  }

  // Self-test registry: each entry names a validator (by `name`) + a spec path.
  const regPath = path.join(root, 'inventory', 'harness-self-test-registry.json');
  const regTxt = readIf(regPath);
  if (regTxt) {
    let reg;
    try {
      reg = JSON.parse(regTxt);
    } catch (_) {
      reg = null;
    }
    if (reg && Array.isArray(reg.validators)) {
      const names = new Set();
      for (const v of reg.validators) {
        if (v && typeof v.name === 'string') names.add(v.name);
        if (v && typeof v.spec === 'string') for (const n of scriptRefsIn(v.spec)) names.add(n);
      }
      add('self-test-registry', 'inventory/harness-self-test-registry.json', names);
    }
  }

  return roots;
}

// Core audit — pure + deterministic given a repo root. No timestamps, no ordering nondeterminism.
function audit(root) {
  const scriptsDir = path.join(root, 'scripts');
  const validators = collectValidators(scriptsDir);
  const validatorSet = new Set(validators);
  const roots = collectRoots(root);

  // Directly-referenced script basenames (across all roots), with provenance.
  const directProvenance = new Map(); // base -> [{kind,file}]
  for (const r of roots) {
    for (const base of r.names) {
      if (!directProvenance.has(base)) directProvenance.set(base, []);
      directProvenance.get(base).push({ kind: r.kind, file: r.file });
    }
  }

  // Forward reachability over require('./x') edges from every directly-referenced basename.
  const reached = new Set(directProvenance.keys());
  const reachReason = new Map(); // base -> {via:'direct', roots} | {via:'transitive', from}
  for (const base of directProvenance.keys()) {
    reachReason.set(base, { via: 'direct', roots: directProvenance.get(base) });
  }
  const queue = [...reached];
  while (queue.length) {
    const base = queue.shift();
    for (const dep of requireEdges(scriptsDir, base)) {
      if (!reached.has(dep)) {
        reached.add(dep);
        reachReason.set(dep, { via: 'transitive', from: base });
        queue.push(dep);
      }
    }
  }

  const report = validators.map(name => {
    const enforced = reached.has(name);
    return {
      validator: name,
      enforced,
      wiring: enforced ? reachReason.get(name) : { via: 'none' },
    };
  });

  const enforced = report.filter(r => r.enforced).map(r => r.validator);
  const unwired = report.filter(r => !r.enforced).map(r => r.validator);

  return {
    checkedValidators: validators.length,
    enforcedCount: enforced.length,
    unwiredCount: unwired.length,
    enforced,
    unwired,
    report,
    roots: roots.map(r => ({ kind: r.kind, file: r.file, references: r.names })),
  };
}

function findRepoRoot() {
  // Flat layout: this file lives at <root>/scripts/enforcement-wiring-audit.js.
  return path.resolve(__dirname, '..');
}

function main(argv) {
  const asJson = argv.includes('--json');
  const root = findRepoRoot();
  const res = audit(root);
  const out = { ...res, runAt: new Date().toISOString() };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }

  console.log(
    `Enforcement-wiring audit: ${res.enforcedCount}/${res.checkedValidators} validators enforced, ` +
      `${res.unwiredCount} UNWIRED (advisory).`
  );
  if (res.unwiredCount) {
    console.log('Unwired guardrails ("reconciled-to-done but never enforced" — burndown):');
    for (const name of res.unwired) console.log(`  ~ scripts/${name}.js — reachable from no enforced root`);
    console.log(
      'Advisory-first (#3802): this list does not block merge. Wire each into a workflow/hook/registry ' +
        'or retire it. Promote to a hard block after a low-FP soak.'
    );
  }
  return 0; // advisory-first: never non-zero in this ticket.
}

module.exports = { audit, collectValidators, scriptRefsIn, requireEdges, collectRoots };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
