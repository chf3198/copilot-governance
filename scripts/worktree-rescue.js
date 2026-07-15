'use strict';
// Rescue/quarantine workflow for stale-risky worktrees (Epic #2248, Refs #2253).
// Classifies worktrees into 8 rescue sub-states, emits rescue report with
// owner/ticket inference, risk reason, next action, UAT flag, and preserve cmds.
// No destructive operations — preservation only.

function ticketFrom(branch = '') {
  const hit = (branch || '').match(/(?:feat|fix|chore|docs|refactor|hotfix)\/(\d+)-/);
  return hit ? Number(hit[1]) : null;
}

// AC1: Eight rescue sub-states for risky worktrees that cannot be proven safe.
const RESCUE_CONFIGS = {
  locked: {
    riskReason: () => 'explicitly locked: removal requires manual lock release',
    nextAction: 'unlock via worktree-active-session-lock, then re-evaluate',
    requiresUAT: false,
    preserve: () => [],
  },
  permanent: {
    riskReason: () => 'sandbox/launcher branch: permanent infrastructure, never remove',
    nextAction: 'no action; launcher branches are permanent by policy',
    requiresUAT: false,
    preserve: () => [],
  },
  detached: {
    riskReason: () => 'detached HEAD: no branch; commits at risk of GC',
    nextAction: 'create rescue branch and draft PR for ticket reconciliation',
    requiresUAT: true,
    preserve: (entry) => [
      `git -C "${entry.path}" switch -c rescue/detached-${Date.now()}-preserve`,
      `gh pr create --draft --title "rescue: detached HEAD at ${entry.path}" --body "Quarantine: detached HEAD. Assign ticket and reconcile."`,
    ],
  },
  'missing-ticket': {
    riskReason: () => 'no ticket number in branch name: cannot infer ownership',
    nextAction: 'rename branch to feat/<N>-desc and file reconciliation ticket',
    requiresUAT: true,
    preserve: (entry) => [
      `git -C "${entry.path}" push origin HEAD:refs/heads/rescue/${entry.branch}-preserve --force-with-lease`,
    ],
  },
  dirty: {
    riskReason: (entry) => `${entry.dirtyCount} modified file(s): uncommitted changes`,
    nextAction: 'commit or stash changes, then re-evaluate',
    requiresUAT: false,
    preserve: (entry) => {
      const ticket = ticketFrom(entry.branch) || 'unknown';
      return [
        `git -C "${entry.path}" switch -c rescue/${ticket}-preserve`,
        `git -C "${entry.path}" add -A && git -C "${entry.path}" commit -m "rescue: preserve dirty state for #${ticket}"`,
        `git -C "${entry.path}" push origin rescue/${ticket}-preserve`,
      ];
    },
  },
  untracked: {
    riskReason: (entry) => `${entry.untrackedCount} untracked file(s): not in git history`,
    nextAction: 'add and commit untracked files or archive them before cleanup',
    requiresUAT: false,
    preserve: (entry) => {
      const ticket = ticketFrom(entry.branch) || 'unknown';
      return [
        `git -C "${entry.path}" switch -c rescue/${ticket}-preserve`,
        `tar -czf /tmp/rescue-${ticket}-untracked-$(date +%s).tar.gz -C "${entry.path}" .`,
      ];
    },
  },
  unpushed: {
    riskReason: (entry) => `${entry.mainAhead ?? entry.ahead ?? 0} commit(s) ahead of main: not on remote`,
    nextAction: 'push to a rescue branch or open a draft PR to preserve commits',
    requiresUAT: false,
    preserve: (entry) => {
      const ticket = ticketFrom(entry.branch) || 'unknown';
      return [
        `git -C "${entry.path}" push origin HEAD:refs/heads/rescue/${ticket}-preserve --force-with-lease`,
      ];
    },
  },
  unknown: {
    riskReason: () => 'classification unclear: ambiguous merge status or unexpected state',
    nextAction: 'run worktree-cleanup-plan with --json for full analysis; escalate to Manager',
    requiresUAT: true,
    preserve: (entry) => {
      const ticket = ticketFrom(entry.branch) || 'unknown';
      return [
        `git -C "${entry.path}" push origin HEAD:refs/heads/rescue/${ticket}-preserve --force-with-lease`,
      ];
    },
  },
};

// AC1: classify a worktree entry into one of the 8 rescue sub-states.
function rescueState(entry) {
  if (entry.locked) return 'locked';
  if ((entry.branch || '').startsWith('sandbox/')) return 'permanent';
  if (!entry.branch) return 'detached';
  if (!ticketFrom(entry.branch)) return 'missing-ticket';
  if ((entry.dirtyCount || 0) > 0) return 'dirty';
  if ((entry.untrackedCount || 0) > 0) return 'untracked';
  if ((entry.mainAhead ?? entry.ahead ?? 0) > 0) return 'unpushed';
  return 'unknown';
}

// AC2: build a rescue report entry with owner/ticket inference, risk reason,
// next action, UAT flag, and preserve commands. Never recommends deletion.
function rescueEntry(entry) {
  const state = rescueState(entry);
  const cfg = RESCUE_CONFIGS[state];
  const ticket = ticketFrom(entry.branch);
  return {
    path: entry.path,
    branch: entry.branch || null,
    ticket,
    rescueState: state,
    riskReason: cfg.riskReason(entry),
    nextAction: cfg.nextAction,
    requiresUAT: cfg.requiresUAT,
    preserveCommands: cfg.preserve(entry), // AC3: preservation commands only
  };
}

// AC4: quarantine path for detached or abandoned worktrees needing ticket reconciliation.
function quarantinePath(entry) {
  const ticket = ticketFrom(entry.branch) || 'unknown';
  const ts = Date.now();
  return {
    branch: `quarantine/${ticket}-abandoned-${ts}`,
    reconciliationNote: `Worktree at ${entry.path} needs ticket reconciliation. Branch: ${entry.branch || 'DETACHED'}.`,
    commands: [
      `git -C "${entry.path}" switch -c quarantine/${ticket}-abandoned-${ts}`,
      `gh pr create --draft --title "quarantine: ${entry.branch || 'DETACHED'}" --body "Needs ticket reconciliation. Path: ${entry.path}"`,
    ],
  };
}

// Generate the full rescue report for an array of worktree entries.
// Only includes entries that are rescue candidates (not confirmed-safe for removal).
function rescueReport(entries) {
  const candidates = entries.filter(e => e.cleanupState !== 'remove' && e.cleanupState !== 'prune-metadata');
  return {
    generatedAt: new Date().toISOString(),
    mode: 'rescue-report',
    requiresUAT: candidates.some(e => RESCUE_CONFIGS[rescueState(e)].requiresUAT),
    entries: candidates.map(rescueEntry),
  };
}

module.exports = { rescueState, rescueEntry, rescueReport, quarantinePath, ticketFrom, RESCUE_CONFIGS };
