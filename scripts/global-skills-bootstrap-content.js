function contractBody(label) {
  return `Global skills routing contract for this repository (${label}):

1. Run \`role-baton-orchestrator\` at task start: Manager → Collaborator → Admin → Consultant. Emit handoff artifacts at each transition. Skip only for trivial tasks (single Q&A, no state changes).
2. Run \`repo-standards-router\` for task classification and gates.
3. Load \`openclaw-universal-system\` as the machine-global OpenClaw baseline.
4. For tasks that could benefit from remote execution or offloading, load \`network-platform-resources\`.
5. For OpenClaw-backed execution, load \`openclaw-availability-utilization\` and enforce preflight + utilization checks.
6. For runtime/UI changes, run \`web-regression-governance\` before final validation.
7. For GitHub governance controls, hand off to \`github-ops-tree-router\`.
8. Run \`workflow-self-anneal\` only after failures or process drift.
9. Keep changes additive and preserve existing repository instructions.`;
}

function skillRoutingBody() {
  return `Use repository and global customization layers together for every task:

1. Read .github/copilot-instructions.md first.
2. Apply nearest AGENTS.md instructions.
3. Prefer reusable global skills from ~/.copilot/skills or ~/.agents/skills before ad-hoc reasoning.
4. For every task, invoke \`role-baton-orchestrator\` first (Manager → Collaborator → Admin → Consultant).
5. For repository workflow routing, invoke:
   - \`repo-standards-router\` for task classification and gates
   - \`openclaw-universal-system\` as the machine-global OpenClaw baseline when OpenClaw might help
   - \`network-platform-resources\` when task could benefit from remote execution or offloading
   - \`openclaw-availability-utilization\` when OpenClaw lane is expected or preferred
   - \`workflow-self-anneal\` only for post-failure/process drift checks
5. Do not claim skill usage unless the skill was actually invoked and followed.`;
}

function openclawBody(globalPolicy, globalSkill) {
  return `Use the machine-global OpenClaw system as the baseline for this repository.

1. Load \`openclaw-universal-system\` for reusable routing, checkpoint, and observability guidance.
2. Load \`openclaw-availability-utilization\` for gateway health and utilization policy.
3. Keep repository-specific rules additive; do not duplicate the global OpenClaw policy unless a local exception is required.
4. Canonical global policy: \`${globalPolicy}\`
5. Canonical global skill: \`${globalSkill}\``;
}

function governanceScriptContent() {
  return `#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${'${BASH_SOURCE[0]}'}")/../.." && pwd)"

required_files=(
  ".github/instructions/global-skills.instructions.md"
  ".github/instructions/skill-routing.instructions.md"
  ".github/instructions/openclaw-universal.instructions.md"
  ".github/scripts/check-global-governance.sh"
  ".github/workflows/global-governance-presence.yml"
)

required_hook_files=(
  ".githooks/pre-commit"
  ".githooks/pre-push"
)

missing=0

echo "Global governance presence check"
for f in "${'${required_files[@]}'}"; do
  if [[ -f "$ROOT/$f" ]]; then
    echo "  ✓ $f"
  else
    echo "  ✗ $f"
    missing=1
  fi
done

for h in "${'${required_hook_files[@]}'}"; do
  if [[ -f "$ROOT/$h" ]]; then
    echo "  ✓ $h"
  else
    echo "  ✗ $h"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "Global governance presence check FAILED"
  exit 1
fi

echo "Global governance presence check PASSED"
`;
}

function workflowContent() {
  return `name: global-governance-presence

on:
  pull_request:
  push:
    branches: [master]

permissions:
  contents: read

jobs:
  presence-gate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Verify global governance files
        run: bash .github/scripts/check-global-governance.sh
`;
}

function defaultHookBody(governanceCall) {
  return `#!/usr/bin/env bash
set -euo pipefail

${governanceCall}
`;
}

module.exports = {
  contractBody,
  skillRoutingBody,
  openclawBody,
  governanceScriptContent,
  workflowContent,
  defaultHookBody
};
