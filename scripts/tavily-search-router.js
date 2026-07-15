#!/usr/bin/env node
'use strict';

const { evaluateTavilyBudget } = require('./tavily-budget-governor');
const DECISION_ORDER = ['free', 'tavily', 'fallback'];

function withMeta(input, provider, lane, routeLabel, reason, budgetDecision) {
  return {
    provider, lane, routeLabel, reason,
    observability: { correlationId: input.correlationId || null, decisionOrder: DECISION_ORDER },
    budgetDecision,
  };
}

/**
 * Route search request with free-first then governed Tavily behavior.
 * @param {{query:string, freeEligible?:boolean, tavilyAvailable?:boolean, policyAllowsTavily?:boolean,
 * spentUsd?:number, allowPaid?:boolean, correlationId?:string}} input
 * @returns {{provider:string, lane:string, routeLabel:string, reason:string, observability:object,
 * budgetDecision:object}}
 */
function routeSearch(input = {}) {
  const queryValue = String(input.query || '').trim();
  if (!queryValue) return withMeta(input, 'none', 'free', 'tavily-free', 'invalid-query', { decision: 'invalid-query' });
  if (input.freeEligible !== false) return withMeta(input, 'local-rag', 'free', 'tavily-free', 'free-first', { decision: 'free-first' });
  const budget = evaluateTavilyBudget({ spentUsd: input.spentUsd, policy: input.policy, allowPaid: input.allowPaid });
  const allowed = input.policyAllowsTavily !== false;
  const available = input.tavilyAvailable !== false;
  if (allowed && available && !budget.hardBlocked) {
    return withMeta(input, 'tavily', 'haiku', budget.routeLabel, 'policy-allowed', budget.budgetDecision);
  }
  const reason = !allowed ? 'policy-blocked' : (!available ? 'provider-unavailable' : 'hard-cap-fallback');
  return withMeta(input, 'free-cloud', 'free', 'tavily-free', reason, budget.budgetDecision);
}

module.exports = { routeSearch };

if (require.main === module) {
  const queryValue = process.argv.slice(2).join(' ');
  process.stdout.write(JSON.stringify(routeSearch({ query: queryValue }), null, 2) + '\n');
}
