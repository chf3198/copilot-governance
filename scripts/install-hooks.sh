#!/usr/bin/env bash
# install-hooks.sh — HAMR Wave 5 child 3 (#934).
# Idempotent installer for the v3.2.2 §R9.2 git hook bundle.
# Symlinks scripts/hooks/* into .git/hooks/* so the repo's R9.2 enforcement is active.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
hooks_src="$repo_root/scripts/hooks"
git_hooks_path=$(git -C "$repo_root" rev-parse --git-path hooks)
case "$git_hooks_path" in
  /*) hooks_dst="$git_hooks_path" ;;
  *) hooks_dst="$repo_root/$git_hooks_path" ;;
esac
mkdir -p "$hooks_dst"

install_hook() {
  local name=$1
  local target=$2
  local src="$hooks_src/$target"
  local dst="$hooks_dst/$name"
  if [ ! -f "$src" ]; then
    echo "❌ missing source hook: $src"
    return 1
  fi
  chmod +x "$src"
  # If dst exists and is the existing readability hook, chain by appending invocation.
  if [ -f "$dst" ] && [ ! -L "$dst" ]; then
    if grep -q "$target" "$dst" 2>/dev/null; then
      echo "✅ $name already chains $target"
      return 0
    fi
    {
      echo ""
      echo "# Appended by install-hooks.sh (#934) — R9.2 enforcement"
      echo "\"$src\" \"\$@\""
    } >> "$dst"
    echo "✅ $name extended with $target"
    return 0
  fi
  link_cycle_safe "$name" "$target" "$src" "$dst"
}

# Cycle-safe idempotent symlink (#2972). A bare `ln -sf "$src" "$dst"` can, on a
# re-run against an already-materialized tree, point the destination hook at
# itself — an ELOOP "too many levels of symbolic links" that bricks every tool
# call routed through that hook. Guard against it three ways:
#   1. Idempotent skip — if dst already resolves to the same real path as src
#      and is readable, there is nothing to do.
#   2. Self-link refusal — never create a link whose source and destination are
#      the same inode (the exact ELOOP brick of #2972).
#   3. Clean replace — remove dst first, then create a fresh symlink, so a stale
#      or already-cyclic dst is repaired rather than re-looped.
link_cycle_safe() {
  local name=$1 target=$2 src=$3 dst=$4
  local src_real dst_real
  src_real=$(readlink -f "$src" 2>/dev/null || true)
  dst_real=$(readlink -f "$dst" 2>/dev/null || true)
  if [ -n "$src_real" ] && [ "$src_real" = "$dst_real" ] && [ -r "$dst" ]; then
    echo "✅ $name already links $target (idempotent skip)"
    return 0
  fi
  if [ -e "$dst" ] && [ "$src" -ef "$dst" ]; then
    echo "❌ refusing self-referential link for $name: $dst -ef $src"
    return 1
  fi
  rm -f "$dst"
  ln -s "$src" "$dst"
  echo "✅ symlinked $name → $target"
}

install_hook pre-push pre-push-branch-check.sh
# branch-ops-audit.sh is multi-purpose; chain it under both event names.
install_hook_audit() {
  local name=$1
  local dst="$hooks_dst/$name"
  if [ -f "$dst" ] && grep -q branch-ops-audit "$dst" 2>/dev/null; then
    echo "✅ $name already chains branch-ops-audit.sh"
    return 0
  fi
  cat > "$dst" <<EOF
#!/usr/bin/env bash
"$hooks_src/branch-ops-audit.sh" $name "\$@"
EOF
  chmod +x "$dst"
  echo "✅ wrote $name wrapper"
}
install_hook_audit post-checkout
install_hook_audit post-commit

echo "R9.2 hooks installed at $hooks_dst — audit log at ~/.megingjord/branch-ops-audit.log"
