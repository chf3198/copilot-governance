#!/usr/bin/env node
'use strict';
// tier: 1
// gov-scaffold-link (Epic #2709 / #2725): guided authoring for a new governed link.
// The author declares chain/link/guarantee/enforcement_point and gets a compliant
// registry-entry stub plus a guard stub wired to the right pattern - so the system
// carries the complexity and an author cannot accidentally ship a discretionary link
// (`operator-discretionary` is rejected up front). Pure logic (unit-testable).

const LEGAL_GUARANTEES = ['enforced', 'auto-emitted'];

function scaffoldLink(opts = {}) {
  const { chain, link, guarantee, enforcementPoint } = opts;
  if (!chain || !link) throw new Error('scaffold: --chain and --link are required');
  if (!LEGAL_GUARANTEES.includes(guarantee)) {
    throw new Error(`scaffold: --guarantee must be one of ${LEGAL_GUARANTEES.join('|')} `
      + "(operator-discretionary is not a legal link type)");
  }
  const registryEntry = [
    `  ${chain}:`,
    `    - link: ${link}`,
    `      guarantee: ${guarantee}`,
    `      enforcement_point: ${enforcementPoint || 'scripts/global/<your-guard>.js'}`,
  ].join('\n');
  const verb = guarantee === 'auto-emitted' ? 'auto-emit on the triggering event' : 'fail-closed: block until satisfied';
  const guardStub = `// ${link} (${guarantee}) - ${verb}\n`
    + `// enforcement_point declared in config/governance-chains.yml under '${chain}'.\n`
    + 'module.exports.check = (ctx = {}) => ({ ok: true, violations: [] });\n';
  return { registryEntry, guardStub };
}

module.exports = { scaffoldLink, LEGAL_GUARANTEES };

if (require.main === module) {
  const args = process.argv.slice(2);
  const get = (flag) => { const idx = args.indexOf(flag); return idx >= 0 ? args[idx + 1] : undefined; };
  const out = scaffoldLink({ chain: get('--chain'), link: get('--link'),
    guarantee: get('--guarantee'), enforcementPoint: get('--enforcement-point') });
  console.log('# Add to config/governance-chains.yml under chains:\n' + out.registryEntry);
  console.log('\n# Guard stub:\n' + out.guardStub);
  console.log('# Then run: node scripts/global/gov-check.js  (same check CI runs)');
}
