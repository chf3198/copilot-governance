// Layer 5: GitHub assignee = ticket-ownership truth (#737)
// Verifies the agent's vendor identity matches the issue assignee
// before allowing a baton transition. Designed to be called from a
// pre-handoff hook OR a CI step.
const { execSync } = require('child_process');

const GH_CLI_TIMEOUT_MS = 10000;
const VENDOR_ALIAS_MAP = {
  claude: ['claude-team', 'anthropic-claude'],
  codex: ['openai-codex', 'codex-team'],
  copilot: ['github-copilot', 'copilot-team'],
  continue: ['continue-team', 'continuedev'],
  cursor: ['cursor-team'],
};

function getIssueAssignees(issueNumber) {
  const cmd = `gh issue view ${issueNumber} --json assignees`;
  const out = execSync(cmd, { encoding: 'utf8', timeout: GH_CLI_TIMEOUT_MS });
  const data = JSON.parse(out);
  return (data.assignees || []).map(a => a.login);
}

function vendorMatches(assigneeLogin, agentVendor) {
  if (!agentVendor) return false;
  const lcVendor = agentVendor.toLowerCase();
  if (lcVendor === 'unassigned' && !assigneeLogin) return true;
  const aliases = VENDOR_ALIAS_MAP[lcVendor] || [];
  return assigneeLogin === lcVendor
    || aliases.includes(assigneeLogin)
    || (assigneeLogin || '').toLowerCase().includes(lcVendor);
}

function checkOwnership(issueNumber, agentVendor) {
  const assignees = getIssueAssignees(issueNumber);
  if (assignees.length === 0) {
    return { ok: true, reason: 'no-assignee', assignees };
  }
  const matched = assignees.some(login => vendorMatches(login, agentVendor));
  return {
    ok: matched,
    reason: matched ? 'vendor-match' : 'vendor-mismatch',
    assignees,
    agentVendor,
  };
}

function main() {
  const [, , issueNum, vendor] = process.argv;
  if (!issueNum || !vendor) {
    process.stderr.write('Usage: agent-assignee-guard.js <issue-number> <agent-vendor>\n');
    process.stderr.write(`  vendors: ${Object.keys(VENDOR_ALIAS_MAP).join(', ')}\n`);
    process.exit(1);
  }
  try {
    const result = checkOwnership(issueNum, vendor);
    if (result.ok) {
      process.stdout.write(`✅ Issue #${issueNum} ownership: ${result.reason}\n`);
      if (result.assignees.length) {
        process.stdout.write(`  assignees: ${result.assignees.join(', ')}\n`);
      }
      process.exit(0);
    }
    process.stderr.write(`❌ Issue #${issueNum} ownership mismatch\n`);
    process.stderr.write(`  agent vendor: ${vendor}\n`);
    process.stderr.write(`  current assignees: ${result.assignees.join(', ') || '(none)'}\n`);
    process.exit(2);
  } catch (err) {
    process.stderr.write(`agent-assignee-guard error: ${err.message}\n`);
    process.exit(3);
  }
}

module.exports = { checkOwnership, vendorMatches, VENDOR_ALIAS_MAP };

if (require.main === module) main();
