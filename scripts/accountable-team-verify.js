'use strict';

// accountable-team-verify — ADVISORY validator for the ownership/baton separation
// invariants (Epic #2345 AC3; design synthesis #2346, section 5).
//
// Advisory-first by construction (2026-07-14 cross-family disposition panel, D2 =
// advisory-first): the CLI ALWAYS exits 0 and never parks a ticket. Promote to a
// hard gate only after a shadow period with a low false-positive rate (< 2% over
// the ticket corpus), matching the harness's advisory-then-promote pattern.
//
// Three invariants checked (all emit `warning`, never a hard failure):
//   AT1  malformed accountable-team:* value (not one of the known teams)
//   AT2  more than one accountable-team:* label on a single ticket
//   AT3  a terminal/backlog NON-EPIC ticket carrying an execution role:* label
//        (the core invariant this Epic protects: role:* is transient, ownership is not)

const fs = require('node:fs');
const path = require('node:path');
const {
  ACCOUNTABLE_TEAM_LABEL_PREFIX,
  isValidAccountableTeam,
  teamFromLabel,
} = require('./accountable-team');

// Non-active states: an execution role:* label must NOT appear here on non-epic
// tickets. Mirrors instructions/role-baton-routing.instructions.md "Hard Rules".
const NON_ACTIVE_STATES = Object.freeze([
  'backlog', 'queued', 'ready', 'done', 'cancelled', 'closed',
]);
const ROLE_LABEL_RE = /\brole:(manager|collaborator|admin|consultant)\b/i;

// Pure. `tickets` = [{ file, number, type, status, labels: string[] }].
// Returns { warnings: [{ code, file, number, message }] }. No I/O, no process exit.
function verifyTickets(tickets) {
  const warnings = [];
  const push = (code, t, message) =>
    warnings.push({ code, file: t.file, number: t.number, message });

  for (const t of Array.isArray(tickets) ? tickets : []) {
    const labels = Array.isArray(t.labels) ? t.labels : [];
    const status = String(t.status || '').toLowerCase();
    const isEpic = String(t.type || '').toLowerCase() === 'epic'
      || labels.some((l) => /^type:epic$/i.test(l));

    // AT1 + AT2 — accountable-team:* label hygiene.
    const atLabels = labels.filter((l) => String(l).startsWith(ACCOUNTABLE_TEAM_LABEL_PREFIX));
    for (const l of atLabels) {
      const value = String(l).slice(ACCOUNTABLE_TEAM_LABEL_PREFIX.length);
      if (!isValidAccountableTeam(value) || teamFromLabel(l) === null) {
        push('AT1_malformed_accountable_team', t, `invalid accountable-team value "${value}"`);
      }
    }
    if (atLabels.length > 1) {
      push('AT2_multiple_accountable_team', t, `ticket carries ${atLabels.length} accountable-team labels`);
    }

    // AT3 — no execution role on terminal/backlog non-epic tickets.
    const nonActive = NON_ACTIVE_STATES.some((s) => status.startsWith(s));
    if (nonActive && !isEpic) {
      const roleLabel = labels.find((l) => ROLE_LABEL_RE.test(l));
      if (roleLabel) {
        push('AT3_role_on_terminal', t, `non-active state "${status}" carries execution label "${roleLabel}"`);
      }
    }
  }
  return { warnings };
}

// ── Mirror parsing (CLI only) ────────────────────────────────────────────────
// Parse a wiki-B mirror ticket file (wiki/work-log/tickets/<n>.md) into the shape
// verifyTickets() expects. Labels live on the "> **Source** ... Labels**: a, b" line.
function parseMirrorTicket(file, txt) {
  const number = Number((path.basename(file).match(/(\d+)/) || [])[1] || 0);
  const status = (txt.match(/^status:\s*"?([A-Za-z-]+)"?/m) || [])[1] || '';
  const labelLine = (txt.match(/Labels\*\*:\s*(.+)$/m) || [])[1] || '';
  const labels = labelLine.split(',').map((s) => s.trim()).filter(Boolean);
  const type = (labels.find((l) => /^type:/i.test(l)) || '').replace(/^type:/i, '');
  return { file: path.basename(file), number, type, status, labels };
}

function scanMirror(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseMirrorTicket(f, fs.readFileSync(path.join(dir, f), 'utf8')));
}

function main() {
  const dir = path.join(__dirname, '..', 'wiki', 'work-log', 'tickets');
  const tickets = scanMirror(dir);
  const { warnings } = verifyTickets(tickets);
  console.log(`[accountable-team-verify] ADVISORY: scanned ${tickets.length} ticket(s), ${warnings.length} warning(s).`);
  for (const w of warnings) console.log(`  ⚠ ${w.file} [${w.code}] ${w.message}`);
  // Advisory-first: never fail the run.
  process.exit(0);
}

if (require.main === module) main();

module.exports = { verifyTickets, parseMirrorTicket, scanMirror, NON_ACTIVE_STATES };
