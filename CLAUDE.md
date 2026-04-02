# CLAUDE.md.template — Governance Instructions for Claude Code
#
# TEMPLATE FILE — do not use directly.
# install.sh processes this file with envsubst and writes the result to
# ~/.claude/CLAUDE.md using the correct absolute path for that machine.
#
# To add or remove imported instructions: edit this file, then re-run install.sh.
# The ${REPO_DIR} placeholder is replaced with the actual repo path at install time.

@${REPO_DIR}/instructions/global-standards.instructions.md
@${REPO_DIR}/instructions/operator-identity-context.instructions.md
@${REPO_DIR}/instructions/github-governance.instructions.md
@${REPO_DIR}/instructions/role-baton-routing.instructions.md
@${REPO_DIR}/instructions/repo-health-onboarding.instructions.md
@${REPO_DIR}/instructions/release-docs-hygiene.instructions.md
@${REPO_DIR}/instructions/workflow-resilience.instructions.md
@${REPO_DIR}/instructions/playwright-mcp-low-resource.instructions.md
