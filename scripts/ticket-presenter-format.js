'use strict';
// ticket-presenter-format (#1905) — markdown formatter for ticket-presenter
// output. Extracted from ticket-presenter.js to keep file under 100 lines.

function row(parts) { return `| ${parts.join(' | ')} |`; }

function detectObservations(items, parentMap, util) {
  const { labelsOf } = util;
  const observations = [];
  const TERMINAL_STATES = ['status:done', 'status:cancelled'];
  for (const issue of items) {
    const labels = labelsOf(issue);
    const statusLabels = labels.filter(label => label.startsWith('status:'));
    if (statusLabels.length > 1) observations.push(`#${issue.number}: multi-status (${statusLabels.join(', ')})`);
    if (statusLabels.length === 0) observations.push(`#${issue.number}: no-status label`);
    const refMatch = (issue.body || '').match(/Refs\s+Epic\s+#(\d+)/i);
    if (refMatch && parentMap[Number(refMatch[1])] === 'CLOSED' && !issue.parent) {
      observations.push(`#${issue.number}: orphan-child (Refs Epic #${refMatch[1]} CLOSED, no native sub-issue link)`);
    }
    const roleLabel = labels.find(label => label.startsWith('role:'));
    if (roleLabel && TERMINAL_STATES.some(state => labels.includes(state))) {
      observations.push(`#${issue.number}: ${roleLabel} on terminal status`);
    }
  }
  return observations;
}

function epicsTable(epics, util) {
  if (epics.length === 0) return '_no open epics_\n';
  const { labelsOf, priOf, statusOf } = util;
  const lines = ['| # | Pri | Status | Title |', '|---|---|---|---|'];
  for (const epic of epics) {
    const labels = labelsOf(epic);
    lines.push(row([`#${epic.number}`, priOf(labels).split(':')[1], statusOf(labels), epic.title.slice(0, 80)]));
  }
  return lines.join('\n') + '\n';
}

function indepsTable(indeps, prilvl, util) {
  const { labelsOf, priOf, statusOf, typeOf } = util;
  const group = indeps.filter(ticket => priOf(labelsOf(ticket)).endsWith(prilvl));
  if (group.length === 0) return `_no open P${prilvl.slice(1)} independents_\n`;
  const lines = ['| # | Status | Type | Title |', '|---|---|---|---|'];
  for (const ticket of group) {
    const labels = labelsOf(ticket);
    lines.push(row([`#${ticket.number}`, statusOf(labels), typeOf(labels), ticket.title.slice(0, 70)]));
  }
  return lines.join('\n') + '\n';
}

function formatMarkdown(result, util) {
  const out = [];
  out.push(`# Open Tickets Landscape`);
  out.push(``);
  out.push(`**Total open**: ${result.totalOpen} (${result.epics.length} Epics + ${result.indeps.length} independents)`);
  out.push(``);
  out.push(`## Open Epics (${result.epics.length})`);
  out.push(``);
  out.push(epicsTable(result.epics, util));
  for (const lvl of ['P1', 'P2', 'P3']) {
    const group = result.indeps.filter(t => util.priOf(util.labelsOf(t)).endsWith(lvl));
    out.push(`## Open Independent Tickets — ${lvl} (${group.length})`);
    out.push(``);
    out.push(indepsTable(result.indeps, lvl, util));
  }
  const all = [...result.epics, ...result.indeps];
  const observations = detectObservations(all, result.parentMap || {}, util);
  if (observations.length > 0) {
    out.push(`## Observations (${observations.length})`);
    out.push(``);
    for (const obs of observations) out.push(`- ${obs}`);
    out.push(``);
  }
  return out.join('\n');
}

module.exports = { formatMarkdown, epicsTable, indepsTable, detectObservations, row };
