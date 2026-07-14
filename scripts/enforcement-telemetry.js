#!/usr/bin/env node
'use strict';

// enforcement-telemetry (#3804, E1 `+telemetry`) — observability + regression guard over the
// enforcement surface.
//
// #3802 (enforcement-wiring-audit) *classifies* every `scripts/*.js` validator as ENFORCED or
// UNWIRED, and #3803 made `governance-verify` itself enforceable. Those give the count *now*. What
// E1 still lacked is observability *over time* (G8): nothing records the enforcement surface, and
// nothing warns when it *regresses* — a newly-added validator landing UNWIRED, or a wired one being
// orphaned. That silent regression is the same "reconciled-to-done but never enforced" drift class
// #3802 exists to defeat, reappearing one validator at a time. This module closes that gap:
//
//   • collect(root)          → a normalized, stable telemetry record derived from audit(root).
//   • compareBaseline(cur,b) → detects enforcement-surface regression vs a committed baseline.
//   • CLI: --json / --emit / --check-regression / --update-baseline (all advisory-first, exit 0).
//
// Hermetic: Node built-ins + in-repo require('./enforcement-wiring-audit') only. No network, no `gh`,
// no untracked deps. Advisory-first (§3g): the CLI never exits non-zero — promote to a hard block
// only after a low-FP soak.

const fs = require('fs');
const path = require('path');
const { audit } = require('./enforcement-wiring-audit');

const SCHEMA_VERSION = 'enforcement-telemetry/v1';
const DEFAULT_BASELINE_REL = path.join('inventory', 'enforcement-telemetry-baseline.json');

function findRepoRoot() {
  // Flat layout: this file lives at <root>/scripts/enforcement-telemetry.js.
  return path.resolve(__dirname, '..');
}

function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}

// Pure: derive a normalized, deterministic telemetry record from the enforcement-wiring audit.
// No timestamp is embedded so the record is stable/diffable when snapshotted as a baseline.
function collect(root) {
  const res = audit(root);
  const unwired = [...res.unwired].sort();
  const enforcedRatio = res.checkedValidators
    ? round4(res.enforcedCount / res.checkedValidators)
    : 1;
  return {
    schemaVersion: SCHEMA_VERSION,
    checkedValidators: res.checkedValidators,
    enforcedCount: res.enforcedCount,
    unwiredCount: res.unwiredCount,
    unwired,
    enforcedRatio,
  };
}

// Pure: compare a current record against a baseline record. The enforcement surface has REGRESSED
// when the unwired count rose OR any validator that was not unwired before is now unwired (catches a
// same-count swap where one validator got wired and another got orphaned). Advisory only.
function compareBaseline(current, baseline) {
  const warnings = [];
  if (!baseline || typeof baseline !== 'object') {
    return { regressed: false, warnings: ['no baseline found — nothing to compare (run --update-baseline)'], newlyUnwired: [] };
  }
  const baseUnwired = new Set(Array.isArray(baseline.unwired) ? baseline.unwired : []);
  const newlyUnwired = current.unwired.filter(n => !baseUnwired.has(n));
  const countRose = current.unwiredCount > (baseline.unwiredCount ?? 0);
  const regressed = countRose || newlyUnwired.length > 0;
  if (countRose) {
    warnings.push(
      `enforcement surface REGRESSED: unwired ${baseline.unwiredCount ?? 0} → ${current.unwiredCount}`
    );
  }
  if (newlyUnwired.length) {
    warnings.push(
      `newly UNWIRED validator(s): ${newlyUnwired.map(n => `scripts/${n}.js`).join(', ')} — ` +
        'wire into a workflow/hook/registry or retire, then --update-baseline'
    );
  }
  return { regressed, warnings, newlyUnwired };
}

function readJsonIf(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

function main(argv) {
  const root = findRepoRoot();
  const rec = collect(root);
  const baselinePath = argValue(argv, '--baseline') || path.join(root, DEFAULT_BASELINE_REL);

  if (argv.includes('--update-baseline')) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(rec, null, 2) + '\n');
    console.log(`enforcement-telemetry: baseline written → ${path.relative(root, baselinePath)}`);
    return 0;
  }

  if (argv.includes('--emit')) {
    const emitPath = argValue(argv, '--emit');
    if (!emitPath) {
      console.error('enforcement-telemetry: --emit requires a path');
      return 0; // advisory-first: never non-zero
    }
    // A JSONL sink line MAY carry a wall-clock stamp (the pure record deliberately does not).
    const line = JSON.stringify({ ...rec, runAt: new Date().toISOString() }) + '\n';
    fs.mkdirSync(path.dirname(path.resolve(emitPath)), { recursive: true });
    fs.appendFileSync(emitPath, line);
    console.log(`enforcement-telemetry: appended 1 record → ${emitPath}`);
    return 0;
  }

  if (argv.includes('--check-regression')) {
    const baseline = readJsonIf(baselinePath);
    const { regressed, warnings } = compareBaseline(rec, baseline);
    console.log(
      `enforcement-telemetry: ${rec.enforcedCount}/${rec.checkedValidators} enforced ` +
        `(ratio ${rec.enforcedRatio}), ${rec.unwiredCount} unwired.`
    );
    for (const w of warnings) console.log(`  ! ${w}`);
    if (!regressed && baseline) console.log('  ok - enforcement surface not regressed vs baseline.');
    console.log('Advisory-first (#3804): this check does not block merge (exit 0).');
    return 0; // advisory-first
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify(rec, null, 2));
    return 0;
  }

  console.log(
    `Enforcement-surface telemetry: ${rec.enforcedCount}/${rec.checkedValidators} validators ` +
      `enforced (ratio ${rec.enforcedRatio}), ${rec.unwiredCount} unwired.`
  );
  return 0;
}

module.exports = { collect, compareBaseline, SCHEMA_VERSION };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
