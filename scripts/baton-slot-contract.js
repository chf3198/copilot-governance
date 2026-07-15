'use strict';
// Irreducible-3 slot contract (Epic #2037 P1.3, Refs #2673). Three baton cases
// genuinely need ONE free-text slot each (LLM judgment/synthesis); EVERYTHING else
// must be schema-rendered + deterministic. This module names the structured fields
// and the single free-text slot per case, and validates that non-slot fields carry
// no narrative — bounding the LLM-format-defect surface to exactly 3 named slots.

const SLOT_CONTRACTS = {
  // per-AC verification: id + verdict are structured; the "how I verified it" prose is the slot.
  PER_AC_VERIFICATION: { structured: ['ac_id', 'verdict'], slot: 'narrative' },
  // epic closeout: the roll-up facts are structured; the cross-child synthesis is the slot.
  CONSULTANT_EPIC_CLOSEOUT: { structured: ['epic', 'children_closed', 'verdict', 'rubric_rating'], slot: 'synthesis' },
  // anneal decision: flaw + decision(enum) + artifact are structured; the why is the slot.
  ANNEAL_DECISION: { structured: ['flaw', 'decision', 'artifact'], slot: 'rationale' },
};
const ANNEAL_DECISIONS = ['file-ticket', 'log-incident-only', 'memory-note-only', 'no-action-justified'];

/** Return the slot contract for a case, or throw on an unknown case name. */
function getContract(caseName) {
  const contract = SLOT_CONTRACTS[caseName];
  if (!contract) throw new Error(`unknown slot-contract case: ${caseName}`);
  return contract;
}

/** Render the deterministic structured block: "key: value" lines in contract order. */
function renderStructured(caseName, fields) {
  const { structured } = getContract(caseName);
  return structured.map((key) => {
    const value = fields[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(`${caseName}: missing structured field '${key}'`);
    }
    return `${key}: ${String(value).trim()}`;
  }).join('\n');
}

/**
 * Validate the slot contract: only the named slot may be free-text; non-slot fields
 * must be single-line (no narrative leak), known, and (for anneal) enum-valid.
 */
function validateSlotContract(caseName, fields) {
  const { structured, slot } = getContract(caseName);
  const allowed = new Set([...structured, slot]);
  const violations = [];
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key)) violations.push(`unknown field '${key}' (not structured, not the '${slot}' slot)`);
  }
  if (fields[slot] === undefined || String(fields[slot]).trim() === '') {
    violations.push(`free-text slot '${slot}' is required and non-empty`);
  }
  for (const key of structured) {
    if (fields[key] !== undefined && /\n/.test(String(fields[key]))) {
      violations.push(`structured field '${key}' must be single-line — narrative belongs in the '${slot}' slot`);
    }
  }
  if (caseName === 'ANNEAL_DECISION' && fields.decision !== undefined
      && !ANNEAL_DECISIONS.includes(String(fields.decision).trim())) {
    violations.push(`decision must be one of ${ANNEAL_DECISIONS.join('/')}: got '${fields.decision}'`);
  }
  return { ok: violations.length === 0, violations, slot };
}

/** Compose the deterministic structured block + the single free-text slot under a heading. */
function renderWithSlot(caseName, fields) {
  const result = validateSlotContract(caseName, fields);
  if (!result.ok) throw new Error(`${caseName} slot-contract violation: ${result.violations.join('; ')}`);
  return `${renderStructured(caseName, fields)}\n\n${result.slot}:\n${String(fields[result.slot]).trim()}\n`;
}

module.exports = {
  SLOT_CONTRACTS, ANNEAL_DECISIONS, getContract, renderStructured, validateSlotContract, renderWithSlot,
};
