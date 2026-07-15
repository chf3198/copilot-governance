#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  resolveRuntime,
  buildPaths,
  globalPolicy,
  globalSkill,
  governanceCall,
  blockStart,
  blockEnd
} = require('./global-skills-bootstrap-context');
const {
  contractBody,
  skillRoutingBody,
  openclawBody,
  governanceScriptContent,
  workflowContent,
  defaultHookBody
} = require('./global-skills-bootstrap-content');
const { normalizeHook, strictAudit } = require('./global-skills-bootstrap-audit');

const { repoPath, mode, profile, strict } = resolveRuntime(process.argv, process.cwd);
const {
  globalSkillsPath,
  skillRoutingPath,
  openclawPath,
  governanceScriptPath,
  workflowPath,
  preCommitPath,
  prePushPath
} = buildPaths(repoPath);

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function exists(file) { return fs.existsSync(file); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { ensureDir(path.dirname(file)); fs.writeFileSync(file, content); }
function isGitRepo() { return exists(path.join(repoPath, '.git')); }

function detectProfileLabel() {
  if (exists(path.join(repoPath, 'index.html')) && exists(path.join(repoPath, 'package.json'))) return 'web-app profile';
  if (exists(path.join(repoPath, 'package.json'))) return 'node profile';
  return profile;
}

function frontmatterFor(current) {
  const match = current.match(/^---\n[\s\S]*?\n---\n*/);
  return match ? match[0] : '---\napplyTo: "**"\n---\n\n';
}

function managedBlock(body) {
  return `${blockStart}\n${body.trim()}\n${blockEnd}\n`;
}

function writeManagedInstruction(filePath, body, legacyDetector) {
  const block = managedBlock(body);
  if (!exists(filePath)) {
    write(filePath, `---\napplyTo: "**"\n---\n\n${block}`);
    return 'created';
  }
  const current = read(filePath);
  if (current.includes(blockStart) && current.includes(blockEnd)) {
    const start = current.indexOf(blockStart);
    const end = current.indexOf(blockEnd) + blockEnd.length;
    const updated = `${current.slice(0, start)}${block}${current.slice(end).replace(/^\n*/, '\n')}`;
    if (updated !== current) {
      write(filePath, updated);
      return 'normalized';
    }
    return 'present';
  }
  if (legacyDetector && current.includes(legacyDetector)) {
    write(filePath, `${frontmatterFor(current)}${block}`);
    return 'normalized';
  }
  write(filePath, `${current.trimEnd()}\n\n${block}`);
  return 'updated';
}

function ensureGlobalSkills() {
  return writeManagedInstruction(globalSkillsPath, contractBody(detectProfileLabel()), 'Global skills routing contract for this repository');
}

function ensureSkillRouting() {
  return writeManagedInstruction(skillRoutingPath, skillRoutingBody(), 'Use repository and global customization layers together for every task:');
}

function ensureOpenClaw() {
  return writeManagedInstruction(openclawPath, openclawBody(globalPolicy, globalSkill), 'Use the machine-global OpenClaw system as the baseline for this repository.');
}

function ensureGovernanceScript() {
  const content = governanceScriptContent();
  if (!exists(governanceScriptPath)) {
    write(governanceScriptPath, content);
    return 'created';
  }
  if (read(governanceScriptPath) !== content) {
    write(governanceScriptPath, content);
    return 'normalized';
  }
  return 'present';
}

function ensureWorkflow() {
  const content = workflowContent();
  if (!exists(workflowPath)) {
    write(workflowPath, content);
    return 'created';
  }
  if (read(workflowPath) !== content) {
    write(workflowPath, content);
    return 'normalized';
  }
  return 'present';
}

function ensureHook(filePath) {
  if (!exists(filePath)) {
    write(filePath, defaultHookBody(governanceCall));
    return 'created';
  }
  const current = read(filePath);
  const normalized = normalizeHook(current, governanceCall);
  const finalText = normalized.endsWith('\n') ? normalized : `${normalized}\n`;
  if (finalText !== current) {
    write(filePath, finalText);
    return current.includes(governanceCall) ? 'normalized' : 'updated';
  }
  return 'present';
}

function ensureHooksPath() {
  if (!isGitRepo()) return 'skipped';
  let current = '';
  try {
    current = execFileSync('git', ['-C', repoPath, 'config', '--local', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim();
  } catch {}
  if (current === '.githooks') return 'present';
  execFileSync('git', ['-C', repoPath, 'config', '--local', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  return current ? 'updated' : 'configured';
}

function getHooksPath() {
  if (!isGitRepo()) return 'skipped';
  try {
    return execFileSync('git', ['-C', repoPath, 'config', '--local', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim() || 'missing';
  } catch {
    return 'missing';
  }
}

function audit() {
  const hooksPath = getHooksPath();
  console.log('GLOBAL_SKILLS_BOOTSTRAP_REPORT');
  console.log(`repo_path: ${repoPath}`);
  console.log(`mode: ${mode}`);
  console.log(`profile: ${detectProfileLabel()}`);
  console.log(`strict: ${strict ? 'true' : 'false'}`);
  console.log(`global_skills: ${exists(globalSkillsPath) ? 'present' : 'missing'}`);
  console.log(`skill_routing: ${exists(skillRoutingPath) ? 'present' : 'missing'}`);
  console.log(`openclaw_overlay: ${exists(openclawPath) ? 'present' : 'missing'}`);
  console.log(`governance_script: ${exists(governanceScriptPath) ? 'present' : 'missing'}`);
  console.log(`governance_workflow: ${exists(workflowPath) ? 'present' : 'missing'}`);
  console.log(`pre_commit: ${exists(preCommitPath) ? 'present' : 'missing'}`);
  console.log(`pre_push: ${exists(prePushPath) ? 'present' : 'missing'}`);
  console.log(`hooks_path: ${hooksPath}`);

  const strictResult = strictAudit({
    exists,
    read,
    paths: {
      globalSkillsPath,
      skillRoutingPath,
      openclawPath,
      governanceScriptPath,
      workflowPath,
      preCommitPath,
      prePushPath
    },
    hooksPath,
    governanceCall,
    blockStart,
    blockEnd
  });
  console.log(`strict_failures: ${strictResult.failed.length}`);
  for (const item of strictResult.failed) console.log(`strict_failure_item: ${item}`);
  if (strict && strictResult.failed.length > 0) process.exit(1);
}

if (mode === 'audit' || mode === 'audit-strict') {
  audit();
  process.exit(0);
}

const results = {
  global_skills: ensureGlobalSkills(),
  skill_routing: ensureSkillRouting(),
  openclaw_overlay: ensureOpenClaw(),
  governance_script: ensureGovernanceScript(),
  governance_workflow: ensureWorkflow(),
  pre_commit: ensureHook(preCommitPath),
  pre_push: ensureHook(prePushPath),
  hooks_path: ensureHooksPath()
};

if (exists(governanceScriptPath)) fs.chmodSync(governanceScriptPath, 0o755);
if (exists(preCommitPath)) fs.chmodSync(preCommitPath, 0o755);
if (exists(prePushPath)) fs.chmodSync(prePushPath, 0o755);

console.log('GLOBAL_SKILLS_BOOTSTRAP_REPORT');
console.log(`repo_path: ${repoPath}`);
console.log(`mode: ${mode}`);
console.log(`profile: ${detectProfileLabel()}`);
for (const [key, value] of Object.entries(results)) console.log(`${key}: ${value}`);
console.log('decision: apply');
console.log('next_steps: repository is wired to the global-skills stack with OpenClaw included');
