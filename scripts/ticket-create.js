#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function createTicket() {
  console.log('\n📋 Ticket Creation Wizard\n');

  const title = await prompt('Title: ');
  const desc = await prompt('Description (short): ');
  const type = await prompt('Type (epic|story|task|bug|doc): ');
  const points = await prompt('Story Points (or skip): ');

  const labels = [`scrum:${type}`, 'status:backlog'];
  let body = desc;
  if (points) body += `\n\n**Story Points**: ${points}`;

  try {
    const cmd = [
      'gh', 'issue', 'create',
      '--title', title,
      '--body', body,
      '--label', labels.join(',')
    ];
    const out = execSync(cmd.join(' '), { encoding: 'utf8' }).trim();
    const match = out.match(/#(\d+)/);
    const issueNum = match ? match[1] : 'N/A';
    console.log(`\n✅ Created ticket #${issueNum}`);
    console.log(`\n📌 Use branch: #${issueNum}-<slug>`);
    console.log(`\n💡 Reference in commits: closes #${issueNum}`);
    rl.close();
  } catch (e) {
    console.error('Error creating ticket:', e.message);
    rl.close();
    process.exit(1);
  }
}

createTicket();
