'use strict';

const signerFormatCanonical = require('./megalint/signer-format-canonical');
const signerFidelity = require('./megalint/signer-fidelity');

function inspectBody(body) {
  const format = signerFormatCanonical.validate({ body });
  const fidelity = signerFidelity.validate({ body });
  return {
    ok: format.ok && fidelity.ok,
    violations: [...(format.violations || []), ...(fidelity.violations || [])],
  };
}

function summarizeTickets(tickets) {
  const inspected = [];
  const violations = [];
  for (const ticket of tickets || []) {
    const body = ticket && ticket.body;
    if (!body) continue;
    const result = inspectBody(body);
    inspected.push(ticket.number);
    for (const violation of result.violations) {
      violations.push({ ticket: ticket.number, ...violation });
    }
  }
  return { inspected, violations, ok: violations.length === 0 };
}

module.exports = { inspectBody, summarizeTickets };