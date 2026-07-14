'use strict';

// epic-child-baton-traceability — ADVISORY detector for Epic-completion BUNDLING drift
// (self-anneal Epic #3800). Flags the failure mode observed completing Epic #2345:
// an Epic is closed and its children are marked closed, but the children were reconciled
// in bulk WITHOUT their own per-child completion evidence — i.e. no independent
// CONSULTANT_CLOSEOUT + GitHub Evidence Block on the child. That makes each child
// un-verifiable on its own and hides skipped role-workflow steps.
//
// Advisory-first by construction (matches accountable-team-verify / harness norm): the
// CLI ALWAYS exits 0 and never parks. Promote to a hard gate only after a shadow period
// with a low false-positive rate.
//
// Invariants (all emit `warning`):
//   EB1  a CLOSED Epic has a CLOSED child that lacks its own CONSULTANT_CLOSEOUT
//   EB2  a CLOSED Epic has a CLOSED child that lacks its own GitHub Evidence Block
//   EB3  a CLOSED Epic has an OPEN child (open-child drift; complements existing epic-close checks)

const fs = require('node:fs');
const path = require('node:path');

const CLOSED_RE = /^(closed|done|cancelled)$/i;
const isClosed = (status) => CLOSED_RE.test(String(status || '').trim());

// Pure. `tickets` = [{ number, file, type, status, refsEpic, hasCloseout, hasEvidence }].
// Returns { warnings: [{ code, epic, child, file, message }] }.
function auditEpics(tickets) {
  const list = Array.isArray(tickets) ? tickets : [];
  const byNumber = new Map(list.map((t) => [t.number, t]));
  const childrenOf = new Map();
  for (const t of list) {
    if (t.refsEpic) {
      if (!childrenOf.has(t.refsEpic)) childrenOf.set(t.refsEpic, []);
      childrenOf.get(t.refsEpic).push(t);
    }
  }
  const warnings = [];
  const push = (code, epic, child, message) =>
    warnings.push({ code, epic: epic.number, child: child ? child.number : null, file: child ? child.file : epic.file, message });

  for (const epic of list) {
    const epicIsEpic = String(epic.type || '').toLowerCase() === 'epic';
    if (!epicIsEpic || !isClosed(epic.status)) continue;
    const kids = childrenOf.get(epic.number) || [];
    for (const child of kids) {
      if (!byNumber.has(child.number)) continue;
      if (!isClosed(child.status)) {
        push('EB3_open_child_of_closed_epic', epic, child,
          `Epic #${epic.number} is closed but child #${child.number} is ${child.status || 'open'}`);
        continue;
      }
      if (!child.hasCloseout) {
        push('EB1_child_missing_closeout', epic, child,
          `closed child #${child.number} of closed Epic #${epic.number} lacks its own CONSULTANT_CLOSEOUT (bundling drift)`);
      }
      if (!child.hasEvidence) {
        push('EB2_child_missing_evidence', epic, child,
          `closed child #${child.number} of closed Epic #${epic.number} lacks its own GitHub Evidence Block (bundling drift)`);
      }
    }
  }
  return { warnings };
}

// ── Mirror parsing (CLI only) ────────────────────────────────────────────────
function parseMirrorTicket(file, txt) {
  const number = Number((path.basename(file).match(/(\d+)/) || [])[1] || 0);
  const status = (txt.match(/^status:\s*"?([A-Za-z-]+)"?/m) || [])[1] || '';
  const labelLine = (txt.match(/Labels\*\*:\s*(.+)$/m) || [])[1] || '';
  const labels = labelLine.split(',').map((s) => s.trim());
  const type = labels.some((l) => /^type:epic$/i.test(l)) ? 'epic'
    : (labels.find((l) => /^type:/i.test(l)) || '').replace(/^type:/i, '');
  const refsEpic = Number((txt.match(/Refs\s+Epic\s+#(\d+)/i) || [])[1] || 0) || null;
  return {
    number, file: path.basename(file), type, status, refsEpic,
    hasCloseout: /##\s+CONSULTANT_CLOSEOUT/m.test(txt),
    hasEvidence: /##\s+GitHub Evidence Block/m.test(txt),
  };
}

function scanMirror(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseMirrorTicket(f, fs.readFileSync(path.join(dir, f), 'utf8')));
}

function main() {
  const dir = path.join(__dirname, '..', 'wiki', 'work-log', 'tickets');
  const { warnings } = auditEpics(scanMirror(dir));
  console.log(`[epic-child-baton-traceability] ADVISORY: ${warnings.length} bundling-drift warning(s).`);
  for (const w of warnings) console.log(`  ⚠ #${w.child ?? w.epic} [${w.code}] ${w.message}`);
  process.exit(0); // advisory-first: never fail the run
}

if (require.main === module) main();

module.exports = { auditEpics, parseMirrorTicket, scanMirror, isClosed };
