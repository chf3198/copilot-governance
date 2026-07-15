#!/usr/bin/env node
'use strict';

// mirror-ticket-lint (#3805) — ADVISORY structural lint for wiki-mirror tickets.
//
// Reconciles governance-verify's legacy ticket parser to the flat wiki-mirror frontmatter schema.
// `governance-verify.js`'s `parse()` reads `<root>/tickets/*.md` expecting a legacy `# Ticket N —`
// header + inline `Status:`/`Priority:`/`Type:` fields. On the flat `main` layout the real tickets
// live at `wiki/work-log/tickets/*.md` and use a DIFFERENT schema: YAML frontmatter (`title: "#N …"`,
// `status:`) + a `> **Labels**: …` line carrying `priority:P#`, `type:*`, etc. So `<root>/tickets/`
// does not exist, the legacy parser sees zero files, and the core structural ticket lint is a silent
// no-op (`checkedTickets: 0`) over the real corpus. (The deferred non-goal recorded by #3803.)
//
// DESIGN (ratified by cross-family consensus — see ticket-3805/): we do NOT re-point the existing
// BLOCKING parser at the mirror. The mirror `status:` frontmatter is freeform and mirror-derived
// (~1005 CLOSED, plus a long freeform tail), so feeding it to the legacy blocking invariants
// (terminal ⇒ require CONSULTANT_CLOSEOUT + Evidence Block; require inline `Priority: P#`) would
// hard-fail ~1005 tickets. Instead this module — matching the established advisory-scanner pattern of
// accountable-team-verify / epic-child-baton-traceability / mirror-admin-completion — applies ONLY
// schema-appropriate, empirically low-FP structural invariants, all emitted as `warning` (never a hard
// failure), wired default-on / non-blocking into governance-verify.
//
// INVARIANTS (all advisory):
//   MTL1 number_mismatch      frontmatter `title: "#N"` number disagrees with the filename number.
//   MTL2 missing_status       no `status:` frontmatter field at all.
//   MTL3 malformed_priority   a `> **Labels**:` line is present but carries no valid `priority:P[0-3]`.
//   MTL4 placeholder_signature `PLACEHOLDER_SIGNATURE` left un-backfilled.
//
// Advisory-first (§3g): the CLI prints the burndown and exits 0. Promote to a hard block only after a
// low-FP soak. Hermetic: Node built-ins only; no network, no `gh`, no untracked deps.

const fs = require('node:fs');
const path = require('node:path');

const MIRROR_TICKETS_REL = path.join('wiki', 'work-log', 'tickets');
const PRIORITY_RE = /\bpriority:P[0-3]\b/i;
const PLACEHOLDER_RE = /PLACEHOLDER_SIGNATURE/;

// Parse a flat wiki-B mirror ticket into the lint record shape. FS-free (txt in hand).
function parseMirrorTicket(file, txt) {
  const base = path.basename(file);
  const fileNumber = Number((base.match(/(\d+)/) || [])[1] || 0);
  const title = (txt.match(/^title:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
  const titleNumber = Number((title.match(/#(\d+)/) || [])[1] || 0);
  const hasStatusField = /^status:\s*\S/m.test(txt);
  const status = (txt.match(/^status:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
  const labelLine = (txt.match(/Labels\*\*:\s*(.+)$/m) || [])[1] || '';
  const hasLabelLine = labelLine.trim().length > 0;
  const hasValidPriority = PRIORITY_RE.test(labelLine);
  const hasPlaceholder = PLACEHOLDER_RE.test(txt);
  return {
    file: base,
    fileNumber,
    titleNumber,
    status,
    hasStatusField,
    hasLabelLine,
    hasValidPriority,
    hasPlaceholder,
  };
}

// Pure. `records` = [{ file, fileNumber, titleNumber, hasStatusField, hasLabelLine, hasValidPriority,
// hasPlaceholder }]. Returns { warnings: [{ code, file, number, message }], checked }. No I/O.
function lint(records) {
  const warnings = [];
  let checked = 0;
  const push = (code, r, message) => warnings.push({ code, file: r.file, number: r.fileNumber, message });
  for (const r of Array.isArray(records) ? records : []) {
    checked++;
    // MTL1 — filename/title number integrity. Only when BOTH are present and they disagree.
    if (r.fileNumber && r.titleNumber && r.fileNumber !== r.titleNumber) {
      push('MTL1_number_mismatch', r, `frontmatter title #${r.titleNumber} disagrees with filename ${r.fileNumber}`);
    }
    // MTL2 — every mirror ticket must carry a `status:` frontmatter field.
    if (!r.hasStatusField) {
      push('MTL2_missing_status', r, 'mirror ticket has no `status:` frontmatter field');
    }
    // MTL3 — a present Labels line must carry a valid priority:P[0-3] label.
    if (r.hasLabelLine && !r.hasValidPriority) {
      push('MTL3_malformed_priority', r, 'Labels line present but carries no valid priority:P[0-3] label');
    }
    // MTL4 — placeholder signature left un-backfilled.
    if (r.hasPlaceholder) {
      push('MTL4_placeholder_signature', r, 'contains PLACEHOLDER_SIGNATURE — backfill required');
    }
  }
  return { warnings, checked };
}

// FS-backed. Builds records from the mirror dir under `root`.
function scanMirror(root) {
  const dir = path.join(root, MIRROR_TICKETS_REL);
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch (_) {
    return [];
  }
  return files.sort().map((f) => parseMirrorTicket(f, fs.readFileSync(path.join(dir, f), 'utf8')));
}

function findRepoRoot() {
  // Flat layout: this file lives at <root>/scripts/mirror-ticket-lint.js.
  return path.resolve(__dirname, '..');
}

function main(argv) {
  const root = findRepoRoot();
  const records = scanMirror(root);
  const { warnings, checked } = lint(records);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ scanned: records.length, checked, warnings }, null, 2));
    return 0;
  }

  const rate = checked ? ((warnings.length / checked) * 100).toFixed(2) : '0.00';
  console.log(
    `[mirror-ticket-lint] ADVISORY: scanned ${records.length} mirror ticket(s), ` +
      `${warnings.length} structural warning(s) (${rate}% of ${checked}).`
  );
  for (const w of warnings) console.log(`  ⚠ ${w.file} [${w.code}] ${w.message}`);
  if (warnings.length) {
    console.log(
      'Flat-mirror ticket schema (#3805): each ticket needs a matching title/filename number (MTL1), a ' +
        '`status:` field (MTL2), a valid priority label when a Labels line is present (MTL3), and no ' +
        'un-backfilled PLACEHOLDER_SIGNATURE (MTL4). Advisory-first: this does not block merge.'
    );
  }
  return 0; // advisory-first: never non-zero.
}

module.exports = { lint, parseMirrorTicket, scanMirror, findRepoRoot, MIRROR_TICKETS_REL };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
