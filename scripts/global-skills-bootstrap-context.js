const path = require('path');
const os = require('os');

const copilotDir = path.join(os.homedir(), '.copilot');
const globalPolicy = path.join(copilotDir, 'openclaw', 'OPENCLAW_UNIVERSAL_SYSTEM.md');
const globalSkill = path.join(copilotDir, 'skills', 'openclaw-universal-system', 'SKILL.md');
const governanceCall = 'bash .github/scripts/check-global-governance.sh';
const blockStart = '<!-- GLOBAL-SKILLS-MANAGED:START -->';
const blockEnd = '<!-- GLOBAL-SKILLS-MANAGED:END -->';

function resolveRuntime(argv, cwd) {
  const repoPath = path.resolve(argv[2] || cwd());
  const mode = argv[3] || 'init';
  const profile = argv[4] || 'standard';
  const strict = mode === 'audit-strict' || argv.includes('--strict');
  return { repoPath, mode, profile, strict };
}

function buildPaths(repoPath) {
  const base = path.join(repoPath, '.github');
  const instructionsDir = path.join(base, 'instructions');
  const scriptsDir = path.join(base, 'scripts');
  const workflowsDir = path.join(base, 'workflows');
  const hooksDir = path.join(repoPath, '.githooks');
  return {
    globalSkillsPath: path.join(instructionsDir, 'global-skills.instructions.md'),
    skillRoutingPath: path.join(instructionsDir, 'skill-routing.instructions.md'),
    openclawPath: path.join(instructionsDir, 'openclaw-universal.instructions.md'),
    governanceScriptPath: path.join(scriptsDir, 'check-global-governance.sh'),
    workflowPath: path.join(workflowsDir, 'global-governance-presence.yml'),
    preCommitPath: path.join(hooksDir, 'pre-commit'),
    prePushPath: path.join(hooksDir, 'pre-push')
  };
}

function dashboardLaunchScript() {
  return `node ${path.join(copilotDir, 'scripts', 'dashboard-serve.js')}`;
}

function installDashboardScript(repoPath) {
  const pkgPath = path.join(repoPath, 'package.json');
  if (!require('fs').existsSync(pkgPath)) return false;
  const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts) pkg.scripts = {};
  if (pkg.scripts.dashboard) return false;
  pkg.scripts.dashboard = dashboardLaunchScript();
  require('fs').writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  return true;
}

module.exports = {
  resolveRuntime, buildPaths,
  globalPolicy, globalSkill, governanceCall,
  blockStart, blockEnd,
  dashboardLaunchScript, installDashboardScript
};
