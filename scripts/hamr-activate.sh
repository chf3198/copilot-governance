#!/usr/bin/env bash
# hamr-activate.sh — HAMR Wave 7 child D (#954).
# One-shot: install git hooks (#934) + cron (#953); check env; print next-step hints.
# Each team runs this once per checkout.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
echo "▶ HAMR activation for: $repo_root"

# Source repo-root .env for provider keys if present; secrets are never echoed.
if [ -f "$repo_root/.env" ]; then
  # shellcheck source=/dev/null disable=SC1091
  set -a; . "$repo_root/.env"; set +a
fi

step() { echo ""; echo "── $1 ──"; }

step "1/6 install R9.2 git hooks (#934)"
bash "$repo_root/scripts/global/install-hooks.sh"

step "2/6 install 6h periodic-push cron (#953)"
if command -v crontab >/dev/null 2>&1; then
  bash "$repo_root/scripts/global/install-cron.sh" || echo "⚠ cron install failed; manual: crontab -e"
else
  echo "⏭ crontab not available — skipping (run hamr-periodic-push.sh manually)"
fi

step "3/6 check operator key + provider key"
missing=()
[ -z "${OPERATOR_KEY_SEED_B64:-}" ] && [ ! -f "${HOME}/.megingjord/keys/operator-ed25519.pem" ] && missing+=(OPERATOR_KEY_SEED_B64)
provider="${HAMR_PROVIDER:-}"
if [ -z "$provider" ]; then
  case "${HAMR_TEAM:-codex}" in
    claude-code) provider="anthropic" ;;
    codex) provider="openai-compatible" ;;
    cursor) provider="provider-neutral" ;;
    *) provider="provider-neutral" ;;
  esac
fi
case "$provider" in
  anthropic) [ -z "${ANTHROPIC_API_KEY:-}" ] && missing+=(ANTHROPIC_API_KEY) ;;
  openai|openai-compatible) [ -z "${OPENAI_API_KEY:-}" ] && missing+=(OPENAI_API_KEY) ;;
  openrouter) [ -z "${OPENROUTER_API_KEY:-}" ] && missing+=(OPENROUTER_API_KEY) ;;
  ollama|fleet|provider-neutral) ;;
  *) echo "⚠ unknown HAMR_PROVIDER=$provider; provider key check skipped" ;;
esac
if [ -n "${TAVILY_API_KEY:-}" ] && ! grep -q "^\[mcp_servers\.tavily\]" "$repo_root/.codex/runtime.config.toml" 2>/dev/null; then
  echo "⚠ TAVILY_API_KEY detected but [mcp_servers.tavily] is missing from .codex/runtime.config.toml"
fi
if [ "${#missing[@]}" -eq 0 ]; then
  echo "✅ all required env present"
else
  echo "⚠ missing env: ${missing[*]}"
  echo "   set in .env or shell profile; HAMR Worker push will skip until set"
fi

step "4/6 verify Worker reachable"
url="${HAMR_URL:-https://hamr.chf3198.workers.dev}"
if curl -sf -o /dev/null "$url/healthz"; then
  echo "✅ Worker /healthz reachable: $url"
else
  echo "⚠ Worker unreachable at $url — set MEGINGJORD_HAMR_DISABLED=1 if intentional"
fi

step "5/6 write per-team opt-in marker"
team="${HAMR_TEAM:-codex}"
case "$team" in
  claude-code) cfg_dir="$HOME/.claude" ;;
  copilot)     cfg_dir="$HOME/.copilot" ;;
  codex)       cfg_dir="$HOME/.codex/devenv-ops" ;;
  cursor)      cfg_dir="$HOME/.cursor" ;;
  *)           echo "⚠ unknown HAMR_TEAM=$team; skipping marker"; cfg_dir="" ;;
esac
if [ -n "$cfg_dir" ]; then
  mkdir -p "$cfg_dir"
  # Wave 8 child 3 (#978): axis_consumers per convergence-design item 5.
  axes_off="${HAMR_AXES_OFF:-}"
  axis_val() { case ",$axes_off," in *,$1,*) echo false ;; *) echo true ;; esac }
  printf '{"enabled":true,"activated_at":"%s","activated_by":"%s","team_runtime":"%s","axis_consumers":{"governance":%s,"tooling":%s,"fleet":%s,"hamr":%s}}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$team" "$team" \
    "$(axis_val governance)" "$(axis_val tooling)" "$(axis_val fleet)" "$(axis_val hamr)" \
    > "$cfg_dir/hamr-config.json"
  echo "✅ wrote $cfg_dir/hamr-config.json (axis_consumers default-on)"
fi

step "6/6 provision baton auto-mode merge authorization (#3346)"
if [ "${MEGINGJORD_NO_AUTOMODE_PROVISION:-}" = "1" ]; then
  echo "⏭ skipped (MEGINGJORD_NO_AUTOMODE_PROVISION=1)"
elif node "$repo_root/scripts/global/automode-provision.js" --apply >/dev/null 2>&1; then
  echo "✅ baton auto-mode authorization provisioned (scoped Admin merge / Consultant close)"
else
  echo "⚠ automode provisioning skipped (read-only FS?); see docs/howto/autonomous-closeout-provisioning.md"
fi

echo ""
echo "▶ HAMR activation complete."
echo "   smoke test:  npx playwright test tests/hamr-team-integration.spec.js"
echo "   sync verify: npm run hamr:sync-verify"
echo "   disable:     export MEGINGJORD_HAMR_DISABLED=1"
