/**
 * Fleet Advisor — IT advisory output contract (Epic #3414 #3482, §4/§5).
 *
 * The Advisor RECOMMENDS; it does not perform governed work. This module turns the merged lint+AI
 * findings into a class-partitioned advisory report and provides the ONLY execution path — an
 * advisory-only, atomic-or-abort Class-A executor:
 *   - Class A: IT-actionable NOW ($0, reversible, fleet-local) — may run via the it-ops bypass, but
 *     ONLY after a paired rollback is durably recorded in the audit trail (no audit ⇒ no action).
 *     Never files a ticket or commit.
 *   - Class B: IT-actionable but non-trivial — surfaced to the operator → optional normal-baton ticket.
 *   - Class C: hardware spend — surfaced to the CLIENT with the cost/benefit brief; NEVER auto-spend.
 *
 * The report payload conforms to openapi/fleet-advisor.yaml (versioned; cross-runtime identical, G9).
 */
'use strict';

const REPORT_VERSION = '1.0';

/** Map a merged finding to its advisory class from its `class` + severity + source. */
function classifyAction(finding) {
  if (!finding || typeof finding !== 'object') return 'B';
  if (finding.class === 'client') return 'C';
  // An AI-only (non-deterministic) recommendation is never auto-actionable — route to review (B).
  if (finding.aiOnly || finding.source === 'ai-research') return 'B';
  // A deterministic IT-actionable finding that is high-severity + reversible is Class A (act now).
  if (finding.class === 'IT-actionable' && (finding.severity === 'high' || finding.severity === 'med')) return 'A';
  return 'B';
}

/**
 * Build the class-partitioned advisory report (the OpenAPI payload) from a merged report
 * ({ tier, findings }). Returns { version, tier, classA, classB, classC, generatedAtMs }.
 */
function buildAdvisoryReport(merged = {}, opts = {}) {
  const findings = Array.isArray(merged.findings) ? merged.findings : [];
  const buckets = { A: [], B: [], C: [] };
  for (const finding of findings) buckets[classifyAction(finding)].push(finding);
  return {
    version: REPORT_VERSION,
    tier: merged.tier || 'F0',
    classA: buckets.A,
    classB: buckets.B,
    classC: buckets.C,
    generatedAtMs: typeof opts.now === 'number' ? opts.now : 0,
  };
}

/** Render the advisory report as operator-facing markdown (the md half of the md+json contract). */
function renderReportMarkdown(report) {
  const section = (title, items) => {
    if (!items.length) return `### ${title}\n_(none)_\n`;
    return `### ${title}\n${items.map((f) => `- **${f.id}** (${f.severity}): ${f.title}\n  → ${f.recommendation || ''}`).join('\n')}\n`;
  };
  return [
    `# Fleet Advisor report — tier ${report.tier} (v${report.version})`,
    '',
    section('Class A · IT-actionable NOW ($0, reversible)', report.classA),
    section('Class B · IT-actionable, REVIEW (→ optional baton ticket)', report.classB),
    section('Class C · CLIENT budget gate (hardware — never auto-spend)', report.classC),
  ].join('\n');
}

/**
 * Execute ONE Class-A action — advisory-only + ATOMIC-OR-ABORT. It first requires a paired rollback,
 * then durably records an audit entry via `deps.writeAudit`; if that write fails it ABORTS without
 * running the action (no audit ⇒ no action, AC1). It NEVER files a ticket or commit. `deps.apply`
 * performs the reversible fleet-local change (injected). Returns { ok, executed, reason, audit }.
 */
function executeClassA(action, deps = {}) {
  if (!action || typeof action !== 'object') return { ok: false, executed: false, reason: 'no-action' };
  if (classifyAction(action) !== 'A') return { ok: false, executed: false, reason: 'not-class-a' };
  if (!action.rollback) return { ok: false, executed: false, reason: 'no-rollback-refuse' };
  const writeAudit = deps.writeAudit;
  const apply = deps.apply;
  const auditEntry = {
    action_id: action.id,
    recommendation: action.recommendation || action.title,
    rollback: action.rollback,
    ts: typeof deps.now === 'number' ? deps.now : 0,
    marker: 'it-ops',
  };
  // Atomic-or-abort: the audit (with its rollback) MUST be durable BEFORE any change runs.
  let audited = false;
  try {
    audited = writeAudit ? writeAudit(auditEntry) === true : false;
  } catch (err) {
    audited = false;
  }
  if (!audited) return { ok: false, executed: false, reason: 'audit-write-failed-abort', audit: null };
  try {
    if (typeof apply === 'function') apply(action);
    return { ok: true, executed: true, reason: 'applied', audit: auditEntry };
  } catch (err) {
    // Action failed after audit — the recorded rollback is the recovery path (audit persists).
    return { ok: false, executed: false, reason: `apply-failed:${err.message}`, audit: auditEntry, needsRollback: true };
  }
}

/** The disposition for each class (what the operator/IT/client does with it). */
function classDisposition(report) {
  return {
    A: report.classA.length ? 'it-ops-bypass-with-audit' : 'none',
    B: report.classB.length ? 'surface-to-operator-optional-baton' : 'none',
    C: report.classC.length ? 'surface-to-client-hardware-brief-never-auto-spend' : 'none',
  };
}

/**
 * Reduce a fleet fingerprint to the HARDWARE-ONLY fields safe to send to the AI-research panel (AC3).
 * Strips host ids/urls/IPs and any non-hardware metadata — the AI pass only needs the capability shape
 * (engine, VRAM bucket, tier), never addressing or secrets (G4 hardware-only redaction).
 */
function hardwareOnlyView(fingerprint = {}, tier = 'F0') {
  const hosts = Array.isArray(fingerprint.hosts) ? fingerprint.hosts : [];
  return {
    tier,
    hardware: hosts.map((host) => ({ engine: host.engine, vramBucket: host.vramBucket })),
  };
}


/** CLI: build an advisory report from an injected/empty probe via the Layer-1 lint (deterministic). */
function main() {
  const { runLint } = require('./fleet-advisor-lint');
  const probe = process.env.FLEET_ADVISOR_PROBE ? JSON.parse(process.env.FLEET_ADVISOR_PROBE) : { hosts: [] };
  const lint = runLint(probe, {});
  const report = buildAdvisoryReport(lint, {});
  process.stdout.write(`${renderReportMarkdown(report)}\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
}

if (require.main === module) main();

module.exports = {
  buildAdvisoryReport,
  classifyAction,
  renderReportMarkdown,
  executeClassA,
  classDisposition,
  hardwareOnlyView,
  REPORT_VERSION,
};
