#!/usr/bin/env node
'use strict';

// mirror-admin-completion (#3799 AC3) — ADVISORY guard for the deterministic Admin-completion
// contract of wiki-mirror tickets.
//
// The `#N` ticket universe is a local wiki mirror with no live GitHub issue (issue space maxes at
// #5). Admin gates keyed to a live issue (`Closes #N`, `gh issue close`) structurally cannot fire, so
// "flip the mirror file to DONE" became the ad-hoc Admin-close — done inconsistently: some DONE
// tickets carry an inline closeout, some a sibling baton-dir closeout, some (e.g. #1893) none at all.
// `governance-verify` cannot catch this: it scans the flat `tickets/` dir, never `wiki/work-log/
// tickets/`. This guard defines and checks the deterministic contract.
//
// CONTRACT — a terminal (DONE/CANCELLED/CLOSED), non-Epic wiki-mirror ticket
// (wiki/work-log/tickets/<N>.md) is Admin-complete iff ALL hold:
//   C1  receipt          — a cross-family consensus receipt (a 16-hex token, or the word "receipt").
//   C2  mirror-ref       — a PR / mirror-mode completion reference in lieu of `Closes #N`
//                          (`PR`, `pull/<n>`, `mirror-mode`, or a `wiki/work-log` mirror-path citation).
//   C3  consultant close — an inline `CONSULTANT_CLOSEOUT` marker OR a sibling
//                          `wiki/work-log/ticket-<N>/…consultant-closeout*.md`.
//
// Advisory-first (§3g): the CLI prints the violation burndown and exits 0. Promote to a hard block
// only after a low-FP soak. Hermetic: Node built-ins only; no network, no `gh`, no untracked deps.

const fs = require('node:fs');
const path = require('node:path');

const MIRROR_TICKETS_REL = path.join('wiki', 'work-log', 'tickets');
const RECEIPT_RE = /\breceipt\b/i;
const HEX16_RE = /\b[0-9a-f]{16}\b/;
const MIRROR_REF_RE = /\bPR\b|pull\/\d+|mirror-mode|mirror path|wiki\/work-log/i;
const INLINE_CLOSEOUT_RE = /CONSULTANT_CLOSEOUT/;
const TERMINAL_RE = /^(done|cancelled|closed)\b/i;

// Parse a wiki-B mirror ticket into the record shape verify() consumes. FS-free (txt in hand); the
// sibling-closeout boolean is filled by scanMirror(), which has the repo root.
function parseMirrorTicket(file, txt) {
  const number = Number((path.basename(file).match(/(\d+)/) || [])[1] || 0);
  const status = (txt.match(/^status:\s*"?([A-Za-z-]+)"?/m) || [])[1] || '';
  const title = (txt.match(/^title:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
  const labelLine = (txt.match(/Labels\*\*:\s*(.+)$/m) || [])[1] || '';
  const isEpic =
    /-epic\.md$/i.test(file) ||
    /^Epic\b/i.test(title) ||
    /\btype:epic\b/i.test(labelLine) ||
    /^#\s*Epic\b/im.test(txt);
  return {
    file: path.basename(file),
    number,
    status,
    isEpic,
    hasReceipt: RECEIPT_RE.test(txt) || HEX16_RE.test(txt),
    hasMirrorRef: MIRROR_REF_RE.test(txt),
    hasInlineCloseout: INLINE_CLOSEOUT_RE.test(txt),
    hasCloseoutFile: false, // filled by scanMirror()
  };
}

// Pure. `records` = [{ file, number, status, isEpic, hasReceipt, hasMirrorRef, hasInlineCloseout,
// hasCloseoutFile }]. Returns { warnings: [{ code, file, number, message }], checked }. No I/O.
function verify(records) {
  const warnings = [];
  let checked = 0;
  const push = (code, r, message) => warnings.push({ code, file: r.file, number: r.number, message });
  for (const r of Array.isArray(records) ? records : []) {
    if (r.isEpic) continue;
    if (!TERMINAL_RE.test(String(r.status || ''))) continue;
    checked++;
    if (!r.hasReceipt) push('MC1_missing_receipt', r, 'terminal mirror ticket cites no cross-family receipt');
    if (!r.hasMirrorRef) push('MC2_missing_mirror_ref', r, 'terminal mirror ticket has no PR/mirror-mode completion reference');
    if (!r.hasInlineCloseout && !r.hasCloseoutFile) {
      push('MC3_missing_closeout', r, 'terminal mirror ticket has neither inline CONSULTANT_CLOSEOUT nor a sibling consultant-closeout file');
    }
  }
  return { warnings, checked };
}

// True iff wiki/work-log/ticket-<N>/ holds a consultant-closeout file.
function hasSiblingCloseout(root, number) {
  const dir = path.join(root, 'wiki', 'work-log', `ticket-${number}`);
  try {
    return fs
      .readdirSync(dir)
      .some((f) => /consultant-closeout.*\.md$/i.test(f));
  } catch (_) {
    return false;
  }
}

// FS-backed. Builds records from the mirror dir under `root`, resolving the sibling-closeout boolean.
function scanMirror(root) {
  const dir = path.join(root, MIRROR_TICKETS_REL);
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch (_) {
    return [];
  }
  return files.sort().map((f) => {
    const rec = parseMirrorTicket(f, fs.readFileSync(path.join(dir, f), 'utf8'));
    rec.hasCloseoutFile = hasSiblingCloseout(root, rec.number);
    return rec;
  });
}

function findRepoRoot() {
  // Flat layout: this file lives at <root>/scripts/mirror-admin-completion.js.
  return path.resolve(__dirname, '..');
}

function main(argv) {
  const root = findRepoRoot();
  const records = scanMirror(root);
  const { warnings, checked } = verify(records);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ scanned: records.length, checked, warnings }, null, 2));
    return 0;
  }

  console.log(
    `[mirror-admin-completion] ADVISORY: scanned ${records.length} mirror ticket(s), ` +
      `${checked} terminal, ${warnings.length} contract violation(s).`
  );
  for (const w of warnings) console.log(`  ⚠ ${w.file} [${w.code}] ${w.message}`);
  if (warnings.length) {
    console.log(
      'Deterministic Admin-close contract (#3799 AC3): a DONE mirror ticket needs a cross-family ' +
        'receipt (C1), a PR/mirror-mode reference (C2), and a consultant closeout inline or in its ' +
        'ticket-<N>/ baton dir (C3). Advisory-first: this does not block merge.'
    );
  }
  return 0; // advisory-first: never non-zero.
}

module.exports = { verify, parseMirrorTicket, scanMirror, hasSiblingCloseout, MIRROR_TICKETS_REL };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
