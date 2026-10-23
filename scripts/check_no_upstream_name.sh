#!/usr/bin/env bash
# Fail when any tracked file matches a pattern in scripts/upstream_name_patterns.txt.
# Usage: scripts/check_no_upstream_name.sh [root]   (root defaults to the repo containing this script)
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="${1:-$(dirname "$here")}"
cd "$root" || exit 2
patterns="scripts/upstream_name_patterns.txt"
[ -f "$patterns" ] || { echo "missing $patterns" >&2; exit 2; }
pats="$(grep -v '^[[:space:]]*#' "$patterns" | grep -v '^[[:space:]]*$')"
[ -n "$pats" ] || { echo "no patterns in $patterns" >&2; exit 2; }
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && [ -n "$(git ls-files | head -1)" ]; then
  files="$(git ls-files)"
else
  files="$(find . -type f -not -path './.git/*' -not -path '*/node_modules/*' -not -path '*/__pycache__/*' \
    -not -path './.pytest_cache/*' -not -path './frontend/dist/*' | sed 's|^\./||')"
fi
files="$(printf '%s\n' "$files" | grep -v -e "^$patterns\$" -e '^scripts/check_no_upstream_name.sh$' -e '^tests/test_no_upstream_name.py$')"
hits=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  out="$(printf '%s\n' "$pats" | grep -I -n -i -H -E -f - -- "$f" 2>/dev/null)"
  [ -n "$out" ] && hits="$hits$out"$'\n'
done <<< "$files"
if [ -n "$hits" ]; then
  echo "upstream name found:" >&2
  printf '%s' "$hits" >&2
  exit 1
fi
echo "no upstream name found"
