const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SKIP = ['node_modules', '.git', 'test-results', 'alpine.min.js'];
const MAX_FUNCTION_LINES = 30;
const BASE_REF_CANDIDATES = ['origin/main', 'main'];

function walkJS(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkJS(full));
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.spec.js')) {
      files.push(full);
    }
  }
  return files;
}

function stripInlineComment(line) {
  // Remove an inline trailing `//` comment that sits OUTSIDE any string literal,
  // so a `#NNNN` ticket ref in a comment is not scanned as a magic number, while
  // `https://host` inside a string and backslash-escaped quotes are preserved (#3470).
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '/' && line[i + 1] === '/') {
      return line.slice(0, i);
    }
  }
  return line;
}

function checkNaming(lines, rel) {
  const warnings = [];
  const singleLetterRe = /\b(?:const|let|var)\s+([a-df-hln-zA-Z])\b/;
  // A magic number is a STANDALONE numeric literal. Reject a digit run adjacent to a
  // word char, dot, hyphen, or underscore on either side so a hyphenated/underscored
  // ticket-or-identifier token (F6-3424, ticket3424, 3424-worktree) is not flagged (#3470).
  const magicRe = /(?<![\w.\-])(\d{3,})(?![\w\-])/;
  const allowedNumbers = new Set(['100', '1000', '1024']);
  lines.forEach((line, idx) => {
    const match = line.match(singleLetterRe);
    if (match) {
      warnings.push({ file: rel, line: idx + 1, rule: 'naming',
        msg: `Single-letter variable '${match[1]}' — use a descriptive name` });
    }
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    if (/const\s+[A-Z_]+/.test(line)) return;
    // Strip an inline trailing `//` comment (outside strings), then GitHub #NNN refs
    // inside string literals, before the magic-number scan (#3470 extends #991 A6 fix).
    const code = stripInlineComment(line);
    const strippedLine = code.replace(/['"`][^'"`]*#\d{2,4}[^'"`]*['"`]/g, '""');
    const magic = strippedLine.match(magicRe);
    if (magic && !allowedNumbers.has(magic[1])) {
      warnings.push({ file: rel, line: idx + 1, rule: 'magic-number',
        msg: `Magic number ${magic[1]} — extract to a named constant` });
    }
  });
  return warnings;
}

function checkFunctionLength(lines, rel) {
  const warnings = [];
  let start = null;
  let name = '';
  let depth = 0;
  lines.forEach((line, idx) => {
    const fn = line.match(/function\s+(\w+)/);
    if (fn && start === null) {
      start = idx;
      name = fn[1];
      depth = 0;
    }
    if (start === null) return;
    depth += (line.match(/{/g) || []).length;
    depth -= (line.match(/}/g) || []).length;
    if (depth <= 0) {
      const length = idx - start + 1;
      if (length > MAX_FUNCTION_LINES) {
        warnings.push({ file: rel, line: start + 1, rule: 'func-length',
          msg: `Function '${name}' is ${length} lines (max ${MAX_FUNCTION_LINES})` });
      }
      start = null;
    }
  });
  return warnings;
}

function checkContent(content, rel) {
  const lines = content.split('\n');
  return [...checkNaming(lines, rel), ...checkFunctionLength(lines, rel)];
}

function checkFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  return checkContent(fs.readFileSync(filePath, 'utf8'), rel);
}

function collectAllFiles() {
  const dashboardJS = walkJS(path.join(ROOT, 'dashboard', 'js'));
  const scriptJS = walkJS(path.join(ROOT, 'scripts')).filter(f => !f.includes('lint-readability'));
  return [...dashboardJS, ...scriptJS];
}

function verifyRef(ref, root = ROOT) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: root, stdio: 'pipe' });
    return true;
  } catch (err) {
    void err; // ref absent in this checkout (e.g. shallow CI, bogus base)
    return false;
  }
}

function resolveBaseRef(explicitBase, root = ROOT) {
  const candidates = explicitBase ? [explicitBase] : BASE_REF_CANDIDATES;
  for (const ref of candidates) {
    if (verifyRef(ref, root)) return ref;
  }
  return null;
}

function isScannedJs(rel) {
  if (!rel.endsWith('.js') || rel.endsWith('.spec.js')) return false;
  if (rel.includes('lint-readability')) return false;
  return rel.startsWith('dashboard/js/') || rel.startsWith('scripts/');
}

function gitChangedPaths(baseRef, root = ROOT) {
  const committed = execFileSync('git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`],
    { cwd: root, encoding: 'utf8' });
  const working = execFileSync('git',
    ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'],
    { cwd: root, encoding: 'utf8' });
  const merged = `${committed}\n${working}`.split('\n').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set(merged)).filter(isScannedJs);
}

function baseWarningCount(baseRef, rel, root = ROOT) {
  try {
    const content = execFileSync('git', ['show', `${baseRef}:${rel}`], { cwd: root, encoding: 'utf8' });
    return checkContent(content, rel).length;
  } catch (err) {
    void err; // path absent at base (new or renamed file) — baseline of zero
    return 0;
  }
}

function sumNetNew(entries) {
  const regressions = [];
  let netNew = 0;
  for (const entry of entries) {
    const delta = entry.current - entry.base;
    if (delta > 0) {
      netNew += delta;
      regressions.push({ file: entry.file, current: entry.current, delta });
    }
  }
  return { netNew, regressions };
}

function computeRegressions(baseRef, root = ROOT) {
  const entries = [];
  for (const rel of gitChangedPaths(baseRef, root)) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue; // deleted in working tree
    entries.push({
      file: rel,
      current: checkContent(fs.readFileSync(abs, 'utf8'), rel).length,
      base: baseWarningCount(baseRef, rel, root),
    });
  }
  return sumNetNew(entries);
}

function runAbsolute(opts) {
  const allFiles = collectAllFiles();
  const warnings = allFiles.flatMap(checkFile);
  if (opts.outputJson) {
    console.log(JSON.stringify({ mode: 'absolute', scannedFiles: allFiles.length,
      warningCount: warnings.length, warnings }));
  } else if (warnings.length) {
    console.log(`\n⚠️  ${warnings.length} readability warnings:\n`);
    warnings.forEach(w => console.log(`  ${w.file}:${w.line} [${w.rule}] ${w.msg}`));
    console.log(`\nScanned ${allFiles.length} JS files.`);
  } else {
    console.log(`✅ ${allFiles.length} JS files pass readability checks.`);
  }
  if (opts.maxWarnings !== null && warnings.length > opts.maxWarnings) {
    console.error(`❌ Readability gate failed: ${warnings.length} > ${opts.maxWarnings}`);
    process.exit(1);
  }
}

function reportChanged(netNew, regressions, baseRef, outputJson) {
  if (outputJson) {
    console.log(JSON.stringify({ mode: 'changed-only', base: baseRef, netNew, regressions }));
  } else if (netNew > 0) {
    console.log(`\n⚠️  ${netNew} NET-NEW readability warning(s) vs ${baseRef}:\n`);
    regressions.forEach(r => console.log(`  ${r.file} (+${r.delta}, now ${r.current})`));
  } else {
    console.log(`✅ No net-new readability regressions vs ${baseRef}.`);
  }
}

function runChangedOnly(opts) {
  const baseRef = resolveBaseRef(opts.base);
  if (!baseRef) {
    console.error('⚠️  diff-aware readability: base ref unavailable — falling back to absolute gate.');
    runAbsolute(opts);
    return;
  }
  let result;
  try {
    result = computeRegressions(baseRef);
  } catch (err) {
    console.error(`⚠️  diff-aware readability: git diff failed (${err.message}) — falling back to absolute gate.`);
    runAbsolute(opts);
    return;
  }
  reportChanged(result.netNew, result.regressions, baseRef, opts.outputJson);
  if (result.netNew > 0) {
    console.error(`❌ Readability gate failed: ${result.netNew} net-new warning(s) introduced.`);
    process.exit(1);
  }
}

function parseArgs(args) {
  const changedArg = args.find(a => a === '--changed-only' || a.startsWith('--changed-only='));
  const maxArg = args.find(a => a.startsWith('--max-warnings='));
  return {
    changedOnly: Boolean(changedArg),
    base: changedArg && changedArg.includes('=') ? changedArg.split('=')[1] : null,
    maxWarnings: maxArg ? Number(maxArg.split('=')[1]) : null,
    outputJson: args.includes('--json'),
  };
}

function run(args = process.argv.slice(2)) {
  const opts = parseArgs(args);
  if (opts.changedOnly) runChangedOnly(opts);
  else runAbsolute(opts);
}

module.exports = {
  run, checkFile, checkContent, resolveBaseRef, computeRegressions,
  isScannedJs, sumNetNew, verifyRef,
};
