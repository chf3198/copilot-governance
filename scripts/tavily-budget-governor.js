#!/usr/bin/env node
'use strict';

const DEFAULT_SOFT_CAP_USD = 3;
const DEFAULT_HARD_CAP_USD = 5;

function defaults(policy = {}) {
  const cfg = policy.tavilyBudget || {};
  return {
    softCapUsd: Number(cfg.softCapUsd ?? DEFAULT_SOFT_CAP_USD),
    hardCapUsd: Number(cfg.hardCapUsd ?? DEFAULT_HARD_CAP_USD),
  };
}

/**
 * Evaluate Tavily budget status and fallback requirement.
 * @param {{spentUsd?:number, policy?:object, allowPaid?:boolean}} input
 * @returns {{routeLabel:string, softAlert:boolean, hardBlocked:boolean, fallbackLane:string,
 * budgetDecision:object}}
 */
function evaluateTavilyBudget(input = {}) {
  const spentUsd = Number(input.spentUsd ?? 0);
  const allowPaid = input.allowPaid !== false;
  const cfg = defaults(input.policy || {});
  const softAlert = spentUsd >= cfg.softCapUsd;
  const hardBlocked = spentUsd >= cfg.hardCapUsd || !allowPaid;
  const routeLabel = hardBlocked ? 'tavily-free' : 'tavily-paid';
  return {
    routeLabel,
    softAlert,
    hardBlocked,
    fallbackLane: hardBlocked ? 'free' : 'none',
    budgetDecision: {
      spentUsd,
      softCapUsd: cfg.softCapUsd,
      hardCapUsd: cfg.hardCapUsd,
      decision: hardBlocked ? 'hard-cap-fallback' : (softAlert ? 'soft-cap-alert' : 'ok'),
    },
  };
}

module.exports = { evaluateTavilyBudget, defaults, DEFAULT_SOFT_CAP_USD, DEFAULT_HARD_CAP_USD };

if (require.main === module) {
  const spent = Number(process.argv[2] || '0');
  const out = evaluateTavilyBudget({ spentUsd: spent });
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
