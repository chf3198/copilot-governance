'use strict';
// pre-merge-review-orchestrator (#1752) — Epic #1736 Phase 3.1.
// Pure helper: planSubAgents → run sub-agents (caller-supplied executor) →
// aggregateFindings → applySeverityGate.

const SUB_AGENTS = ['bug-detect', 'security', 'test-coverage', 'architectural-drift'];
const SEVERITY_ORDER = { low: 0, medium: 1, high: 2 };
const TRIGGER_RAISE = {
  'auth-code-change': 'high', 'db-schema-migration': 'high',
  'new-external-dependency': 'high', 'secret-credential-path': 'high',
  'workflow-yaml-actions-change': 'high', 'cryptographic-primitive': 'high',
  'permission-scope-expansion': 'high', 'dependency-version-bump': 'medium',
  'test-deletion': 'medium', 'workflow-yaml-trivial': 'low',
};

function disabled(env = process.env) {
  return env.MEGINGJORD_MODEL_REVIEW_DISABLED === '1';
}

function planSubAgents(input) {
  if (disabled()) return { skipped: 'opt-out', sub_agents: [] };
  const requested = input.sub_agents || SUB_AGENTS;
  return { skipped: null, sub_agents: requested.filter(a => SUB_AGENTS.includes(a)) };
}

function maxSeverity(a, b) {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

function applyTriggerEscalation(finding) {
  if (!finding.trigger || !TRIGGER_RAISE[finding.trigger]) return finding;
  const targetSeverity = TRIGGER_RAISE[finding.trigger];
  // 3-tier confidence interaction per #1743
  if (finding.confidence >= 0.7) return { ...finding, severity: targetSeverity };
  if (finding.confidence >= 0.3) {
    const reduced = targetSeverity === 'high' ? 'medium' : (targetSeverity === 'medium' ? 'low' : 'low');
    return { ...finding, severity: reduced };
  }
  return finding;
}

function aggregateFindings(subAgentResults) {
  const all = [];
  for (const result of subAgentResults || []) {
    for (const finding of (result.findings || [])) all.push(applyTriggerEscalation(finding));
  }
  return all;
}

function severityDistribution(findings) {
  const dist = { low: 0, medium: 0, high: 0 };
  for (const finding of findings) {
    if (dist[finding.severity] !== undefined) dist[finding.severity]++;
  }
  return dist;
}

function applySeverityGate(findings, mode = 'advisory-only') {
  const dist = severityDistribution(findings);
  const hasHigh = dist.high > 0;
  const hasMedium = dist.medium > 0;
  let decision;
  if (mode === 'advisory-only') {
    decision = (hasHigh || hasMedium) ? 'advisory_findings' : 'pass';
  } else if (mode === 'enforcing') {
    if (hasHigh) decision = 'fail';
    else if (hasMedium) decision = 'fail';
    else decision = 'pass';
  } else {
    decision = 'pass';
  }
  return { decision, severity_distribution: dist, findings_count: findings.length };
}

module.exports = {
  SUB_AGENTS, TRIGGER_RAISE, planSubAgents, aggregateFindings,
  applySeverityGate, severityDistribution, applyTriggerEscalation,
  maxSeverity, disabled,
};
