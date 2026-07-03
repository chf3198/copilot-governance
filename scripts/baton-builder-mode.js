'use strict';
// Builder-as-default promotion state (Epic #2037, Refs #2692 promotion of #2675).
// PROMOTED: the programmatic builders are now the DEFAULT artifact path — the
// replay-eval gate (baton-replay-eval.js) was met over the real mined corpus
// (#2692: 17/17 = 1.00 byte-identical valid artifacts; 0.85 literal-blended).
// The env flag is now the ROLLBACK switch: set it falsy to fall back to the legacy
// hand/template path. So a rollback is a one-env-var change, not a code revert (G6).
const DEFAULT_ENV = 'MEGINGJORD_BATON_BUILDER_DEFAULT';
const FALSY = new Set(['0', 'false', 'off', 'no']);

// true  => programmatic builder is the default artifact path (post-promotion default)
// false => explicit rollback to the legacy path (env flag set falsy)
function isBuilderDefault(env = process.env) {
  return !FALSY.has(String(env[DEFAULT_ENV] || '').trim().toLowerCase());
}

// Observable promotion state for /quota-style introspection + closeout evidence.
function promotionState(env = process.env) {
  return {
    envFlag: DEFAULT_ENV,
    builderDefault: isBuilderDefault(env),
    promoted: true,
    gate: 'replay-eval >= 0.85 MET (#2692: 1.00 valid / 0.85 blended); rollback via falsy env flag',
  };
}

module.exports = { isBuilderDefault, promotionState, DEFAULT_ENV };
