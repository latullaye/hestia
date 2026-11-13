#!/usr/bin/env bash
# Type-checks the Edge Functions with Deno (npx deno, or DENO=/path/to/deno).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DENO="${DENO:-npx --yes deno}"
status=0
for f in "$ROOT"/supabase/functions/*/index.ts; do
  name="$(basename "$(dirname "$f")")"
  out="$(cd "$(dirname "$f")" && NO_COLOR=1 $DENO check index.ts 2>&1 | grep -v '^Download\|^Check')"
  if [ -n "$out" ]; then echo "== $name"; echo "$out"; status=1; else echo "ok  $name"; fi
done
exit $status
