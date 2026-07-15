'use strict';
// Shared label-rules evaluator for label-lint and label-scan workflows.
// Single source of truth — prevents the gates from disagreeing (#1307).
// Refs #2785: label-manifest.json is the canonical label definition list;
// provisioner and this file share the same manifest so they can never drift.
const path = require('path');
const MANIFEST_PATH = path.join(__dirname, 'label-manifest.json');
function loadManifest() { return JSON.parse(require('fs').readFileSync(MANIFEST_PATH, 'utf8')); }

const STATUS_ROLE_REQUIRED = {
  'status:in-progress': 'role:collaborator',
  'status:testing':     'role:admin',
  'status:review':      'role:consultant',
};
const EPIC_ONLY_STATES = ['status:dormant', 'status:deferred'];
const TERMINAL_STATES = ['status:done', 'status:cancelled'];

function evaluate(issue) {
  const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
  const state = issue.state || 'open';
  const statusLabels = labels.filter(l => l.startsWith('status:'));
  const roleLabels = labels.filter(l => l.startsWith('role:'));
  const laneLabels = labels.filter(l => l.startsWith('lane:'));
  const areaLabels = labels.filter(l => l.startsWith('area:'));
  const isEpic = labels.includes('type:epic');
  const violations = [];

  if (statusLabels.length === 0) violations.push('Rule 1: missing status: label');
  else if (statusLabels.length > 1) violations.push(`Rule 1: multiple status labels (${statusLabels.join(', ')})`);
  if (roleLabels.length > 1) violations.push(`Rule 2: multiple role labels (${roleLabels.join(', ')})`);
  if (areaLabels.length === 0) violations.push('Rule 6: missing area: label');
  else if (areaLabels.length > 1) violations.push(`Rule 6: multiple area labels (${areaLabels.join(', ')})`);

  if (state === 'closed') {
    const nonArchive = roleLabels.filter(r => r !== 'role:archived');
    if (nonArchive.length > 0) {
      violations.push(`Rule 7: closed issue retains role labels (${nonArchive.join(', ')})`);
    }
    if (!statusLabels.some(s => s === 'status:done' || s === 'status:cancelled')) {
      violations.push('Rule 7b: closed issue must have status:done or status:cancelled');
    }
  } else if (statusLabels.some(s => TERMINAL_STATES.includes(s))) {
    violations.push('Rule 12: open issue must not carry terminal status:done or status:cancelled');
  }

  if (isEpic) {
    if (statusLabels.includes('status:backlog') && !roleLabels.includes('role:manager')) {
      violations.push('Rule E2: Epic at status:backlog requires role:manager');
    }
    if (statusLabels.includes('status:in-progress') && !roleLabels.includes('role:manager')) {
      violations.push('Rule E3: Epic at status:in-progress requires role:manager');
    }
    if (statusLabels.includes('status:ready')) {
      violations.push('Rule 9: Epic cannot be at status:ready (child tickets only)');
    }
    for (const epicState of EPIC_ONLY_STATES) {
      if (statusLabels.includes(epicState) && !roleLabels.includes('role:manager')) {
        violations.push(`Rule E5: Epic at ${epicState} requires role:manager`);
      }
    }
  } else {
    if (statusLabels.includes('status:backlog') && roleLabels.length > 0) {
      violations.push(`Rule 4: status:backlog child must not have role label (${roleLabels.join(', ')})`);
    }
    if (statusLabels.includes('status:done') && roleLabels.length > 0) {
      violations.push(`Rule 3: status:done must not have role label (${roleLabels.join(', ')})`);
    }
    for (const [status, required] of Object.entries(STATUS_ROLE_REQUIRED)) {
      if (statusLabels.includes(status) && !roleLabels.includes(required)) {
        violations.push(`Rule 8: ${status} requires ${required}`);
      }
    }
    for (const epicState of EPIC_ONLY_STATES) {
      if (statusLabels.includes(epicState)) {
        violations.push(`Rule E5: ${epicState} is Epic-only (non-Epic tickets cannot use it)`);
      }
    }
  }

  if (statusLabels.includes('status:triage') && !roleLabels.includes('role:manager')) {
    violations.push('Rule 5: status:triage requires role:manager');
  }
  if (statusLabels.includes('status:ready') && laneLabels.length !== 1) {
    violations.push('Rule 10: status:ready requires exactly one lane label');
  }

  // Rule 11 (#1305 AC7): cross-team consult labels are mutually exclusive.
  if (labels.includes('consultant:cross-team-needed') && labels.includes('consultant:cross-team-in-progress')) {
    violations.push('Rule 11: consultant:cross-team-needed and consultant:cross-team-in-progress are mutually exclusive');
  }

  return violations;
}

module.exports = { evaluate, STATUS_ROLE_REQUIRED, EPIC_ONLY_STATES, MANIFEST_PATH, loadManifest };
