#!/usr/bin/env sh
# Build the AMO/signing package: only the files the extension ships at runtime.
# Everything else in the tree (git, editor config, README screenshots, notes)
# stays out so the addons.mozilla.org validator has nothing to trip over.
set -eu

OUT="screeps-sc.zip"
ROOT="$(pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp manifest.json background.js content.js module.js settings.json LICENSE "$STAGE/"
cp -R modules options icons vendor "$STAGE/"

# Cruft that can ride along in a recursive copy.
find "$STAGE" -name '.DS_Store' -delete

rm -f "$OUT"
( cd "$STAGE" && zip -r -q -X "$ROOT/$OUT" . )

echo "built $OUT"
unzip -l "$OUT"

# Validate with Mozilla's linter (same checks AMO runs):
#   npx addons-linter@latest screeps-sc.zip
