#!/usr/bin/env bash
# The repository is public: fails when a tracked file looks like it holds a secret or a real email address.
# (It cannot know the family's names: that part of the rule is on whoever writes. See CLAUDE.md.)
set -uo pipefail
cd "$(dirname "$0")/.."
patterns='sk-ant-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|"private_key"\s*:|eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|hst_[0-9a-f]{64}|GOCSPX-[A-Za-z0-9_-]{10,}|[A-Za-z0-9._%+-]+@(gmail|outlook|hotmail|icloud|yahoo|proton|protonmail|live|me)\.[a-z.]+|@group\.calendar\.google\.com'
hits="$(git ls-files -z | grep -zv '^package-lock.json$' | xargs -0 grep -nIE "$patterns" 2>/dev/null | grep -v '^scripts/check-privacy.sh:' | grep -vE 'family…@group\.calendar\.google\.com')"
if [ -n "$hits" ]; then
  echo "Possible secret or personal data in tracked files:"; echo "$hits"; exit 1
fi
echo "privacy check: ok"
