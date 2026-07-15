'use strict';
const cp = require('child_process');
const { lintEpicDrift } = require('./lint-epic-drift.js');

function gh(args) {
  return cp.execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

function syncEpic(epicNumber) {
  console.log(`🔄 Syncing Epic #${epicNumber} status & sub-issues...`);
  const raw = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  const [owner, repo] = raw.split('/');

  const findings = lintEpicDrift(owner, repo);
  const epicFindings = findings.filter(f => f.epic === epicNumber || f.parent === epicNumber);

  if (!epicFindings.length) {
    console.log(`✅ Epic #${epicNumber} is completely synchronized. No drift found!`);
    return;
  }

  const parentNode = JSON.parse(gh(['api', 'graphql', '-f', `query=query { repository(owner:"${owner}", name:"${repo}") { issue(number:${epicNumber}) { id } } }`]));
  const parentId = parentNode?.data?.repository?.issue?.id;

  for (const f of epicFindings) {
    if (f.class === 'B') {
      console.log(`🔗 Natively linking Child #${f.child} to parent Epic #${epicNumber}...`);
      const childNode = JSON.parse(gh(['api', 'graphql', '-f', `query=query { repository(owner:"${owner}", name:"${repo}") { issue(number:${f.child}) { id } } }`]));
      const childId = childNode?.data?.repository?.issue?.id;
      if (parentId && childId) {
        gh(['api', 'graphql', '-f', `query=mutation { addSubIssue(input: { issueId: "${parentId}", subIssueId: "${childId}" }) { subIssue { number } } }`]);
      }
    } else if (f.class === 'C') {
      console.log(`📝 Auto-posting progress update comment for closed child #${f.child}...`);
      const body = `## Epic Progress Update\n\nChild issue #${f.child} has been verified and closed in active workflows.`;
      gh(['issue', 'comment', String(epicNumber), '--body', body]);
    } else if (f.class === 'A') {
      console.log(`📈 Promoting Epic #${epicNumber} status label to status:review...`);
      gh(['issue', 'edit', String(epicNumber), '--add-label', 'status:review', '--remove-label', 'status:triage,status:in-progress,status:backlog']);
    }
  }

  console.log(`🎉 Epic #${epicNumber} synchronization complete!`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--epic');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: npm run epic:sync -- --epic <number>');
    process.exit(1);
  }
  try {
    syncEpic(parseInt(args[idx + 1], 10));
  } catch (err) {
    console.error('Sync failed:', err.message);
    process.exit(1);
  }
}

module.exports = { syncEpic };
