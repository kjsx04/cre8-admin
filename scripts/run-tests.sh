#!/usr/bin/env bash
#
# Test runner for cre8-admin.
#
# Every *.test.ts file in src/ is a plain TypeScript script: it runs its own
# assertions, prints "ok <name>" per check, and calls process.exit(1) if any
# of them failed. There is no describe/it and no test framework — so all this
# runner has to do is execute each file with a TypeScript-capable loader and
# stop at the first file that exits non-zero.
#
# We use `tsx` because the test files import their modules without a .ts
# extension (e.g. `import { foo } from "./foo"`). Plain `node` cannot resolve
# those, even with --experimental-strip-types.
#
# Usage:
#   npm test              # run everything
#   npm test subject      # run only files whose path contains "subject"

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

FILTER="${1:-}"

# Collect test files, optionally narrowed by the filter argument.
if [ -n "$FILTER" ]; then
  FILES=$(find src -name '*.test.ts' | grep -- "$FILTER" | sort)
else
  FILES=$(find src -name '*.test.ts' | sort)
fi

if [ -z "$FILES" ]; then
  echo "No test files matched${FILTER:+ \"$FILTER\"}."
  exit 1
fi

TOTAL=0
FAILED=0
FAILED_FILES=""

for FILE in $FILES; do
  TOTAL=$((TOTAL + 1))

  # Capture output so a passing file stays quiet — we only want to read the
  # output of files that actually failed.
  if OUTPUT=$(npx --yes tsx "$FILE" 2>&1); then
    printf '  \033[32mok\033[0m    %s\n' "$FILE"
  else
    FAILED=$((FAILED + 1))
    FAILED_FILES="$FAILED_FILES $FILE"
    printf '  \033[31mFAIL\033[0m  %s\n' "$FILE"
    # Indent the failing file's own output so it reads as nested detail.
    echo "$OUTPUT" | sed 's/^/        /'
  fi
done

echo
if [ "$FAILED" -eq 0 ]; then
  printf '\033[32m%s test file(s) passed.\033[0m\n' "$TOTAL"
  exit 0
fi

printf '\033[31m%s of %s test file(s) failed:\033[0m\n' "$FAILED" "$TOTAL"
for FILE in $FAILED_FILES; do
  echo "  $FILE"
done
exit 1
