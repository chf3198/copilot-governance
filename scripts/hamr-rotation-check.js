'use strict';
// tier: 2
// hamr-rotation-check (#1724) — HAMR-side rotation validator adapter.
// Consumes baton-team-model-v2 helper (#1723); shapes output to match
// the /mcp rotation:check response format per Phase 2.2 (#1720) design.
// The actual Cloudflare worker route deployment is operational —
// this adapter is the pure function the worker invokes.

const v2 = require('./baton-team-model-v2.js');

function buildResponse(violations, mode, operatorModeHonored = true) {
  return {
    decision: violations.length === 0 ? 'pass' : (mode === 'strict-rotation' ? 'fail' : 'advisory_violation'),
    rule_evaluated: violations.length > 0 ? violations[0].rule : null,
    violations: violations,
    operator_mode: mode,
    advisory_or_required: mode === 'strict-rotation' ? 'required' : 'advisory',
    operator_mode_honored: operatorModeHonored,
  };
}

function rotationCheck(params) {
  if (!params || typeof params !== 'object') {
    return { decision: 'fail', error: 'invalid_params' };
  }
  const input = {
    operator_mode: params.operator_mode || 'strict-rotation',
    labels: params.labels || [],
    roles_observed: params.roles_observed || {},
  };
  const result = v2.enforceRotationV2(input);
  if (result.skipped) {
    return {
      decision: 'pass',
      skipped: result.skipped,
      operator_mode: result.mode,
      advisory_or_required: result.mode === 'strict-rotation' ? 'required' : 'advisory',
    };
  }
  return buildResponse(result.violations, result.mode);
}

module.exports = { rotationCheck, buildResponse };
