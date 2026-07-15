#!/usr/bin/env node
// premium-budget-governor (#1794) — soft/hard limit downgrade + structured rationale for paid premium lane.
// Composes with #1797 escalation taxonomy (downgrade reasons map to escalation_reason).
'use strict';

const { readTelemetry, summarize } = require('./model-routing-telemetry');

const PROMPT_HINT_MAX_LENGTH = 160;
const DEFAULT_SOFT_LIMIT = 0.11;
const DEFAULT_HARD_LIMIT = 0.12;
const DEFAULT_WINDOW_DAYS = 30;

function normalizePremiumRationale(route, prompt, taskClass, complexity) {
  const provided = route.premiumRationale;
  if (provided && provided.reason && provided.evidence) {
    return { reason: String(provided.reason), evidence: String(provided.evidence) };
  }
  const promptHint = String(prompt || '').slice(0, PROMPT_HINT_MAX_LENGTH) || 'no prompt context';
  return {
    reason: `task_class=${taskClass}; complexity=${Number(complexity ?? 0).toFixed(2)}`,
    evidence: promptHint,
  };
}

function getDefaults(policy) {
  const budget = (policy && policy.premiumBudget) || {};
  return {
    softLimit: budget.softLimitShare ?? DEFAULT_SOFT_LIMIT,
    hardLimit: budget.hardLimitShare ?? DEFAULT_HARD_LIMIT,
    windowDays: budget.windowDays || DEFAULT_WINDOW_DAYS,
  };
}

function computePremiumShare(route, windowDays) {
  return Number.isFinite(route.premiumShare30d)
    ? Number(route.premiumShare30d)
    : summarize(readTelemetry(windowDays)).premiumShare;
}

function decideDowngrade(premiumShare, softLimit, hardLimit) {
  if (premiumShare >= hardLimit) return { downgraded: true, reason: 'premium_budget_hard_limit' };
  if (premiumShare >= softLimit) return { downgraded: true, reason: 'premium_budget_soft_limit' };
  return { downgraded: false, reason: null };
}

function resolveBudget(policy, route, lane) {
  const disabled = route.disablePremiumBudget === true;
  const defaults = getDefaults(policy);
  if (lane !== 'premium' || disabled) {
    return { enabled: !disabled, downgraded: false, premiumShare30d: null,
      downgradeReason: null, softLimit: defaults.softLimit, hardLimit: defaults.hardLimit };
  }
  const premiumShare30d = computePremiumShare(route, defaults.windowDays);
  const { downgraded, reason } = decideDowngrade(premiumShare30d, defaults.softLimit, defaults.hardLimit);
  return { enabled: true, downgraded, premiumShare30d, downgradeReason: reason,
    softLimit: defaults.softLimit, hardLimit: defaults.hardLimit };
}

module.exports = { normalizePremiumRationale, resolveBudget, decideDowngrade, getDefaults };
