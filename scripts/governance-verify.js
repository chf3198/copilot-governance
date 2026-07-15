#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const readyCutoffMs = 24 * 60 * 60 * 1000;

const childrenFromSection = txt => {
  const m = txt.match(/\nChildren:\n([\s\S]*?)(\n\n|\n##\s)/);
  if (!m) return [];
  return [...m[1].matchAll(/#(\d+)/g)].map(x => +x[1]);
};

const parse = txt => ({
  number: +(txt.match(/^# Ticket\s+(\d+)\s+—/m)?.[1] || 0),
  type: txt.match(/^Type:\s*(.+)$/m)?.[1]?.trim() || '',
  status: txt.match(/^Status:\s*(.+)$/m)?.[1]?.trim() || '',
  priority: txt.match(/^Priority:\s*(P\d)\b/m)?.[1] || '',
  children: childrenFromSection(txt),
  hasCloseout: /##\s+CONSULTANT_CLOSEOUT/m.test(txt),
  hasEvidence: /##\s+GitHub Evidence Block/m.test(txt),
  hasBlocker: /BLOCKER_NOTE|owner\s*:|unblock_condition\s*:|eta_or_review_time\s*:/i.test(txt),
  hasPlaceholder: /PLACEHOLDER_SIGNATURE/.test(txt),
});

const terminal = s => /^done\s*\(`closed`\)/i.test(s) || /^cancelled/i.test(s);

// Pure verifier over a repo root. `root` is the layout root under which `tickets/` and
// `.github/workflows/` are resolved. Returns the result object; never calls process.exit / prints.
// `opts.now` overrides the clock (ms) for deterministic stale-ready checks in tests.
function verify(root, opts = {}) {
  const nowMs = opts.now ?? Date.now();
  const dir = path.join(root, 'tickets');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()
    : [];
  const workflowsDir = path.join(root, '.github', 'workflows');

  const all = new Map();
  for (const f of files) {
    const p = path.join(dir, f);
    const txt = fs.readFileSync(p, 'utf8');
    const stat = fs.statSync(p);
    all.set(parse(txt).number, { file: f, mtimeMs: stat.mtimeMs, ...parse(txt) });
  }

  const issues = [];
  const hints = [];

  // Merge-queue readiness: if a merge-queue-relevant workflow is PRESENT it must declare a
  // `merge_group:` trigger. Absent legacy workflows (`lint.yml`/`branch-name.yml` predate this repo's
  // flat layout and are not part of it) are NOT an error — the repo may not use them (#3803). A
  // present-but-`merge_group`-less workflow is still flagged, preserving the original intent.
  const mergeQueueWorkflows = ['lint.yml', 'branch-name.yml'];
  for (const wf of mergeQueueWorkflows) {
    const p = path.join(workflowsDir, wf);
    if (!fs.existsSync(p)) continue; // presence-tolerant
    const yml = fs.readFileSync(p, 'utf8');
    const hasMergeGroup = /\n\s*merge_group\s*:/m.test(yml);
    if (!hasMergeGroup) {
      issues.push(`.github/workflows/${wf}: missing merge_group trigger`);
      hints.push({ code: 'merge_group_missing', file: `.github/workflows/${wf}` });
    }
  }

  for (const t of all.values()) {
    if (t.hasPlaceholder) issues.push(`${t.file}: contains PLACEHOLDER_SIGNATURE — backfill required`);
    if (!/^P[0-3]$/.test(t.priority)) issues.push(`${t.file}: missing/invalid Priority`);
    if (terminal(t.status) && /role:/i.test(t.status)) issues.push(`${t.file}: closed status contains role label`);
    if (terminal(t.status) && !t.hasCloseout) issues.push(`${t.file}: missing CONSULTANT_CLOSEOUT`);
    if (terminal(t.status) && !t.hasEvidence && t.type !== 'Epic') issues.push(`${t.file}: missing GitHub Evidence Block`);
    if (t.type === 'Epic' && terminal(t.status)) {
      const kids = t.children.filter(n => n !== t.number && all.has(n));
      const openKids = kids.filter(n => !terminal(all.get(n).status));
      if (openKids.length) issues.push(`${t.file}: epic closed with open children ${openKids.join(', ')}`);
    }
    const isReady = /^ready\b/i.test(t.status);
    const isP0P1 = /^P[01]$/.test(t.priority);
    const staleReady = nowMs - t.mtimeMs > readyCutoffMs;
    if (isReady && isP0P1 && staleReady && !t.hasBlocker) {
      issues.push(`${t.file}: ready >24h without BLOCKER_NOTE fields`);
      hints.push({ code: 'ready_sla_violation', file: t.file, ticket: t.number });
    }
  }

  // Advisory-first ownership/baton-separation checks (Epic #2345 AC3; synthesis #2346).
  // Default-on but NEVER contributes to `issues` — it only adds advisory hints, so the
  // pass/fail verdict is unchanged. Set ACCOUNTABLE_TEAM_ADVISORY=0 to silence.
  const accountableAdvisories = [];
  if (process.env.ACCOUNTABLE_TEAM_ADVISORY !== '0') {
    try {
      const at = require('./accountable-team-verify');
      const mirrorDir = path.join(root, 'copilot-governance', 'wiki', 'work-log', 'tickets');
      const fallbackDir = path.join(__dirname, '..', 'wiki', 'work-log', 'tickets');
      const scanDir = fs.existsSync(mirrorDir) ? mirrorDir : fallbackDir;
      const { warnings } = at.verifyTickets(at.scanMirror(scanDir));
      for (const w of warnings) {
        accountableAdvisories.push(w);
        hints.push({ code: `advisory_${w.code}`, file: w.file, ticket: w.number, advisory: true });
      }
    } catch (_) { /* advisory only: never break governance-verify on this path */ }
  }

  // Advisory-first Epic-completion bundling-drift checks (Epic #3800; detector reuse-first).
  // Default-on but NEVER contributes to `issues` — it only adds advisory hints, so the
  // pass/fail verdict is unchanged. Set EPIC_CHILD_BATON_ADVISORY=0 to silence.
  const epicChildBatonAdvisories = [];
  if (process.env.EPIC_CHILD_BATON_ADVISORY !== '0') {
    try {
      const ecbt = require('./epic-child-baton-traceability');
      const mirrorDir = path.join(root, 'copilot-governance', 'wiki', 'work-log', 'tickets');
      const fallbackDir = path.join(__dirname, '..', 'wiki', 'work-log', 'tickets');
      const scanDir = fs.existsSync(mirrorDir) ? mirrorDir : fallbackDir;
      const { warnings } = ecbt.auditEpics(ecbt.scanMirror(scanDir));
      for (const w of warnings) {
        epicChildBatonAdvisories.push(w);
        hints.push({ code: `advisory_${w.code}`, file: w.file, ticket: w.child ?? w.epic, advisory: true });
      }
    } catch (_) { /* advisory only: never break governance-verify on this path */ }
  }

  // Advisory-first enforcement-surface telemetry (#3804; E1 `+telemetry`). Default-on but NEVER
  // contributes to `issues` — it only records the enforcement surface (G8 observability) and adds an
  // advisory hint when validators are unwired, so the pass/fail verdict is unchanged. The audit is run
  // over THIS repo's scripts/ (path.resolve(__dirname,'..')), not the passed layout `root`, so it is
  // correct under throwaway ticket-fixture roots too. Set ENFORCEMENT_TELEMETRY_ADVISORY=0 to silence.
  let enforcementTelemetry = null;
  if (process.env.ENFORCEMENT_TELEMETRY_ADVISORY !== '0') {
    try {
      const et = require('./enforcement-telemetry');
      enforcementTelemetry = et.collect(path.resolve(__dirname, '..'));
      if (enforcementTelemetry.unwiredCount > 0) {
        hints.push({
          code: 'advisory_enforcement_unwired',
          count: enforcementTelemetry.unwiredCount,
          unwired: enforcementTelemetry.unwired,
          advisory: true,
        });
      }
    } catch (_) { /* advisory only: never break governance-verify on this path */ }
  }

  // Advisory-first mirror-ticket Admin-completion contract (#3799 AC3). Default-on but NEVER
  // contributes to `issues` — it only flags DONE wiki-mirror tickets that lack the deterministic
  // Admin-close evidence (cross-family receipt / PR-mirror reference / consultant closeout). Scans
  // THIS repo's wiki/ (path.resolve(__dirname,'..')), not the passed layout `root`, so it is a no-op
  // under throwaway ticket-fixture roots. Set MIRROR_ADMIN_ADVISORY=0 to silence.
  const mirrorAdminAdvisories = [];
  if (process.env.MIRROR_ADMIN_ADVISORY !== '0') {
    try {
      const mac = require('./mirror-admin-completion');
      const { warnings } = mac.verify(mac.scanMirror(path.resolve(__dirname, '..')));
      for (const w of warnings) {
        mirrorAdminAdvisories.push(w);
        hints.push({ code: `advisory_${w.code}`, file: w.file, ticket: w.number, advisory: true });
      }
    } catch (_) { /* advisory only: never break governance-verify on this path */ }
  }

  // Advisory-first flat-mirror ticket structural lint (#3805). Reconciles the legacy `# Ticket N —`
  // parser to the flat wiki-mirror frontmatter schema: the blocking `parse()` above reads `<root>/
  // tickets/` (absent on flat main → silent `checkedTickets: 0`), so the real corpus at wiki/work-log/
  // tickets/ was never structurally linted. Default-on but NEVER contributes to `issues` — it only adds
  // advisory hints, so the pass/fail verdict is unchanged. Scans THIS repo's wiki/ (path.resolve(
  // __dirname,'..')), not the passed layout `root`, so it is a no-op under throwaway fixture roots.
  // Set MIRROR_TICKET_LINT_ADVISORY=0 to silence.
  const mirrorTicketAdvisories = [];
  if (process.env.MIRROR_TICKET_LINT_ADVISORY !== '0') {
    try {
      const mtl = require('./mirror-ticket-lint');
      const { warnings } = mtl.lint(mtl.scanMirror(path.resolve(__dirname, '..')));
      for (const w of warnings) {
        mirrorTicketAdvisories.push(w);
        hints.push({ code: `advisory_${w.code}`, file: w.file, ticket: w.number, advisory: true });
      }
    } catch (_) { /* advisory only: never break governance-verify on this path */ }
  }

  // Advisory-first reversible-vs-carveout autonomy-decision audit (#3799 AC2). Default-on but NEVER
  // contributes to `issues` — it only validates Autonomy-Decision markers that ARE logged in Admin/
  // handoff baton docs (malformed value, or a carve-out that records an autonomous merge). Docs with
  // no marker are not penalized, so the current corpus produces zero findings. Scans THIS repo's wiki/
  // (path.resolve(__dirname,'..')), not the passed layout `root`, so it is a no-op under throwaway
  // ticket-fixture roots. Set AUTONOMY_CLASSIFIER_ADVISORY=0 to silence.
  const autonomyAdvisories = [];
  if (process.env.AUTONOMY_CLASSIFIER_ADVISORY !== '0') {
    try {
      const ac = require('./autonomy-classifier');
      const { warnings } = ac.verifyAdminDocs(ac.scanAdminDocs(path.resolve(__dirname, '..')));
      for (const w of warnings) {
        autonomyAdvisories.push(w);
        hints.push({ code: `advisory_${w.code}`, file: w.file, advisory: true });
      }
    } catch (_) { /* advisory only: never break governance-verify on this path */ }
  }

  // Advisory-first completion-gate marker audit (#3799 AC4). Default-on but NEVER contributes to
  // `issues` — it only validates `Completion-Gate:` markers that ARE logged in Admin/handoff/
  // completion baton docs (malformed value CG1, or a `blocked` gate that cites untracked / working-
  // tree drift as the blocker CG2 — the annealed 718-untracked false positive). Docs with no marker
  // are not penalized, so the current corpus produces zero findings. Scans THIS repo's wiki/
  // (path.resolve(__dirname,'..')), not the passed layout `root`, so it is a no-op under throwaway
  // ticket-fixture roots. Set COMPLETION_GATE_ADVISORY=0 to silence.
  const completionGateAdvisories = [];
  if (process.env.COMPLETION_GATE_ADVISORY !== '0') {
    try {
      const cg = require('./completion-gate');
      const { warnings } = cg.verifyGateDocs(cg.scanGateDocs(path.resolve(__dirname, '..')));
      for (const w of warnings) {
        completionGateAdvisories.push(w);
        hints.push({ code: `advisory_${w.code}`, file: w.file, advisory: true });
      }
    } catch (_) { /* advisory only: never break governance-verify on this path */ }
  }

  // Advisory-first Epic-close bundling-drift SHADOW-PERIOD metric (#3800 AC4). Default-on but NEVER
  // contributes to `issues` — it records the EB1/EB2/EB3 finding-rate over the tracked vs working-tree
  // corpora (G8 observability) and a data-driven `promotionReadiness` verdict per AC4's < 2% rule, and
  // adds a non-blocking hint when promotion is NOT yet ready (e.g. a historical working-tree backlog
  // remains — AC5 scope). It does NOT flip EB1/EB2/EB3 to blocking. Scans THIS repo (path.resolve(
  // __dirname,'..')), not the passed layout `root`, so it is a no-op under throwaway fixture roots.
  // Set EPIC_BATON_SHADOW_ADVISORY=0 to silence.
  let epicBatonShadowMetric = null;
  if (process.env.EPIC_BATON_SHADOW_ADVISORY !== '0') {
    try {
      const sm = require('./epic-baton-shadow-metric');
      epicBatonShadowMetric = sm.shadowMetric(sm.scanCorpora(path.resolve(__dirname, '..')));
      if (!epicBatonShadowMetric.promotionReadiness.ready) {
        hints.push({
          code: 'advisory_epic_baton_promotion_deferred',
          reason: epicBatonShadowMetric.promotionReadiness.reason,
          backlog: epicBatonShadowMetric.promotionReadiness.backlog,
          advisory: true,
        });
      }
    } catch (_) { /* advisory only: never break governance-verify on this path */ }
  }

  // Advisory-first Epic-child historical backfill PLAN (#3800 AC5). Default-on but NEVER contributes
  // to `issues` — it records the dry-run exemption manifest (grandfather / has-evidence / must-
  // remediate) for the pre-existing bundling-drift instances (G8 observability) and adds a non-blocking
  // hint when post-cutoff instances still need a real per-child baton. It FABRICATES NOTHING and mutates
  // no ticket. Scans THIS repo (path.resolve(__dirname,'..')), not the passed layout `root`, so it is a
  // no-op under throwaway fixture roots. Set EPIC_BATON_BACKFILL_ADVISORY=0 to silence.
  let epicBatonBackfillPlan = null;
  if (process.env.EPIC_BATON_BACKFILL_ADVISORY !== '0') {
    try {
      const bp = require('./epic-baton-backfill-plan');
      epicBatonBackfillPlan = bp.backfillPlan(bp.scanFlagged(path.resolve(__dirname, '..')));
      if (epicBatonBackfillPlan.mustRemediate.length > 0) {
        hints.push({
          code: 'advisory_epic_baton_backfill_must_remediate',
          count: epicBatonBackfillPlan.mustRemediate.length,
          tickets: epicBatonBackfillPlan.mustRemediate,
          advisory: true,
        });
      }
    } catch (_) { /* advisory only: never break governance-verify on this path */ }
  }

  return {
    checkedTickets: all.size,
    failedChecks: issues.length,
    status: issues.length ? 'fail' : 'pass',
    issues,
    remediationHints: hints,
    accountableTeamAdvisories: accountableAdvisories,
    epicChildBatonAdvisories,
    enforcementTelemetry,
    mirrorAdminAdvisories,
    mirrorTicketAdvisories,
    autonomyAdvisories,
    completionGateAdvisories,
    epicBatonShadowMetric,
    epicBatonBackfillPlan,
    runAt: new Date().toISOString(),
  };
}

module.exports = { verify };

if (require.main === module) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  // Layout root: this validator lives at <root>/scripts/governance-verify.js, so the flat repo root is
  // one level up. (The prior `../..` assumed a nested install whose parent held `tickets/`; on this flat
  // repo that inspected the repo's PARENT and silently checked nothing.) `GOVERNANCE_ROOT` overrides.
  const root = process.env.GOVERNANCE_ROOT
    ? path.resolve(process.env.GOVERNANCE_ROOT)
    : path.resolve(__dirname, '..');
  const result = verify(root);

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Governance verify: ${result.status.toUpperCase()} (${result.checkedTickets} tickets)`);
    if (result.issues.length) result.issues.forEach(i => console.log(`- ${i}`));
    if (result.accountableTeamAdvisories.length) {
      console.log(`Ownership advisories (non-blocking): ${result.accountableTeamAdvisories.length}`);
      result.accountableTeamAdvisories.forEach(w => console.log(`  ~ ${w.file} [${w.code}] ${w.message}`));
    }
    if (result.epicChildBatonAdvisories.length) {
      console.log(`Epic-child baton advisories (non-blocking): ${result.epicChildBatonAdvisories.length}`);
      result.epicChildBatonAdvisories.forEach(w => console.log(`  ~ ${w.file} [${w.code}] ${w.message}`));
    }
    if (result.mirrorTicketAdvisories && result.mirrorTicketAdvisories.length) {
      console.log(`Mirror-ticket structural advisories (non-blocking): ${result.mirrorTicketAdvisories.length}`);
      result.mirrorTicketAdvisories.forEach(w => console.log(`  ~ ${w.file} [${w.code}] ${w.message}`));
    }
    if (result.autonomyAdvisories && result.autonomyAdvisories.length) {
      console.log(`Autonomy-decision advisories (non-blocking): ${result.autonomyAdvisories.length}`);
      result.autonomyAdvisories.forEach(w => console.log(`  ~ ${w.file} [${w.code}] ${w.message}`));
    }
    if (result.completionGateAdvisories && result.completionGateAdvisories.length) {
      console.log(`Completion-gate advisories (non-blocking): ${result.completionGateAdvisories.length}`);
      result.completionGateAdvisories.forEach(w => console.log(`  ~ ${w.file} [${w.code}] ${w.message}`));
    }
    if (result.epicBatonShadowMetric) {
      const pr = result.epicBatonShadowMetric.promotionReadiness;
      console.log(`Epic-baton shadow metric (non-blocking): promotion ${pr.ready ? 'READY' : 'DEFER'} — ${pr.reason}`);
    }
    if (result.epicBatonBackfillPlan) {
      const s = result.epicBatonBackfillPlan.summary;
      console.log(`Epic-baton backfill plan (non-blocking, dry-run): ${s.total} flagged — `
        + `${s.grandfather} grandfather / ${s.hasEvidence} has-evidence / ${s.mustRemediate} must-remediate`);
    }
  }
  process.exit(result.issues.length ? 1 : 0);
}
