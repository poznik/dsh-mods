#!/bin/sh
# Checks that a push keeps project memory in step with the code it changes.
#
# Rules (see AGENTS.md, "Память при пуше"):
#   1. A changed file inside a mod folder (except that mod's AGENTS.md) needs the
#      same mod's AGENTS.md in the same push.
#   2. A new mod folder (one with a package.json) also needs the root AGENTS.md,
#      because the mod table there lists it.
#   3. A change under tools/ or .github/ needs the root AGENTS.md too, because the
#      repository tooling and the memory rules are documented there.
#
# Usage: tools/check-memory.sh <base-ref-or-empty> <head-ref>
# Exit code 0 means the push may proceed; 1 prints what is missing.
set -u

base=${1:-}
head=${2:-HEAD}
zero=0000000000000000000000000000000000000000

cd "$(git rev-parse --show-toplevel)" || exit 1

# Every file of a ref, or the empty list when the ref is unknown/empty.
files_of() {
  if [ -z "$1" ] || [ "$1" = "$zero" ]; then
    return 0
  fi
  git ls-tree -r --name-only "$1" 2>/dev/null || true
}

# Mod folder names of a ref: top-level directories holding a package.json.
mods_of() {
  files_of "$1" | sed -n 's|^\([^/][^/]*\)/package\.json$|\1|p'
}

if [ -z "$base" ] || [ "$base" = "$zero" ]; then
  if git rev-parse --verify --quiet origin/main >/dev/null; then
    base=$(git rev-parse origin/main)
  fi
fi

# A brand-new remote branch has no base: every file counts as changed. A known
# base compares normally, and an identical tree legitimately changes nothing.
if [ -z "$base" ] || [ "$base" = "$zero" ]; then
  changed=$(git ls-tree -r --name-only "$head")
else
  changed=$(git diff --name-only --diff-filter=ACMRD "$base" "$head" 2>/dev/null || true)
fi
[ -z "$changed" ] && exit 0

old_mods=$(mods_of "$base")
new_mods=$(mods_of "$head")

has_line() {
  printf '%s\n' "$1" | grep -qx -- "$2"
}

root_memory=0
has_line "$changed" "AGENTS.md" && root_memory=1

status=0

# 1 + 2: per-mod memory, and the root table for a newly added mod.
for mod in $new_mods; do
  mod_changed=$(printf '%s\n' "$changed" | sed -n "s|^$mod/||p")
  [ -z "$mod_changed" ] && continue

  # The mod's own memory must ride along with any of its other files.
  other=$(printf '%s\n' "$mod_changed" | grep -vx 'AGENTS.md' || true)
  mod_memory=0
  has_line "$mod_changed" "AGENTS.md" && mod_memory=1
  if [ -n "$other" ] && [ "$mod_memory" -eq 0 ]; then
    printf 'pre-push: %s/ changed without %s/AGENTS.md\n' "$mod" "$mod"
    status=1
  fi

  # A mod that did not exist in the base is new: its row must appear in the table.
  if ! has_line "$old_mods" "$mod" && [ "$root_memory" -eq 0 ]; then
    printf 'pre-push: new mod %s/ is not listed in the root AGENTS.md\n' "$mod"
    status=1
  fi
done

# A removed mod also changes the table.
for mod in $old_mods; do
  if ! has_line "$new_mods" "$mod" && [ "$root_memory" -eq 0 ]; then
    printf 'pre-push: removed mod %s/ is still listed in the root AGENTS.md\n' "$mod"
    status=1
  fi
done

# 3: repository tooling and CI rules live in the root memory.
tooling=$(printf '%s\n' "$changed" | grep -E '^(tools|\.github)/' || true)
if [ -n "$tooling" ] && [ "$root_memory" -eq 0 ]; then
  printf 'pre-push: repository tooling changed without the root AGENTS.md\n'
  status=1
fi

if [ "$status" -ne 0 ]; then
  printf '\nProject memory is part of the change: see "Память при пуше" in AGENTS.md.\n'
fi
exit "$status"
