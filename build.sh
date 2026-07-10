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

# The source manifest declares both background.service_worker (Chrome MV3) and
# background.scripts (Firefox MV3). Firefox ignores service_worker and its linter
# warns about it (BACKGROUND_SERVICE_WORKER_IGNORED). Strip service_worker from
# the staged manifest only, so the AMO/Firefox package ships just background.scripts
# and the warning is silenced. Chrome keeps service_worker via the unmodified
# source manifest.json (this rewrite touches the build copy, never the source).
node -e '
  const fs = require("fs");
  const path = process.argv[1];
  const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
  if (manifest.background) {
    delete manifest.background.service_worker;
  }
  fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
' "$STAGE/manifest.json"

# Cruft that can ride along in a recursive copy.
find "$STAGE" -name '.DS_Store' -delete

rm -f "$OUT"
( cd "$STAGE" && zip -r -q -X "$ROOT/$OUT" . )

echo "built $OUT"
unzip -l "$OUT"

# Validate with Mozilla's linter (same checks AMO runs):
#   npx addons-linter@latest screeps-sc.zip
