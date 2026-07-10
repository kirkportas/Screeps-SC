#!/usr/bin/env sh
# Build the browser-specific store packages: only the files the extension ships
# at runtime. Everything else in the tree (git, editor config, README
# screenshots, notes) stays out so each store's validator has nothing to trip on.
#
# The source manifest.json is cross-browser: it declares BOTH
# background.service_worker (Chrome MV3) and background.scripts (Firefox MV3),
# plus browser_specific_settings (Firefox-only). Each store rejects/warns on the
# other browser's keys, so we emit one zip per browser, stripping the keys that
# do not belong. The source manifest is never modified - only staged copies are.
set -eu

FIREFOX_OUT="screeps-sc-firefox.zip"
CHROME_OUT="screeps-sc-chrome.zip"
ROOT="$(pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# --- Common staging: the runtime files both packages share. ---
cp manifest.json background.js content.js module.js settings.json LICENSE "$STAGE/"
cp -R modules options icons vendor "$STAGE/"

# Cruft that can ride along in a recursive copy.
find "$STAGE" -name '.DS_Store' -delete

# Package a zip from the common stage using a per-browser manifest. The manifest
# is rewritten from the source with `node -e` (JSON parse -> delete keys -> write)
# into $STAGE/manifest.json just before zipping, so the two builds never collide.
#   $1 = output zip name   $2 = node script that mutates `manifest` in place
build_package() {
  out="$1"
  transform="$2"

  node -e "
    const fs = require('fs');
    const src = process.argv[1];
    const dest = process.argv[2];
    const manifest = JSON.parse(fs.readFileSync(src, 'utf8'));
    ($transform)(manifest);
    fs.writeFileSync(dest, JSON.stringify(manifest, null, 2) + '\n');
  " "$ROOT/manifest.json" "$STAGE/manifest.json"

  rm -f "$out"
  ( cd "$STAGE" && zip -r -q -X "$ROOT/$out" . )
  echo "built $out"
}

# Firefox/AMO: Firefox ignores background.service_worker and its linter warns
# BACKGROUND_SERVICE_WORKER_IGNORED, so strip it and ship only background.scripts.
# browser_specific_settings (gecko id, strict_min_version, data collection) is
# required by Firefox, so it stays.
build_package "$FIREFOX_OUT" "function (m) {
  if (m.background) {
    delete m.background.service_worker;
  }
}"

# Chrome Web Store: Chrome MV3 requires background.service_worker and does not
# support background.scripts, so strip background.scripts. browser_specific_settings
# is Firefox-only; Chrome ignores it but logs "Unrecognized manifest key" warnings,
# so drop the whole block.
build_package "$CHROME_OUT" "function (m) {
  if (m.background) {
    delete m.background.scripts;
  }
  delete m.browser_specific_settings;
}"

echo "---"
unzip -l "$FIREFOX_OUT"
unzip -l "$CHROME_OUT"

# Validate the Firefox package with Mozilla's linter (same checks AMO runs):
#   npx addons-linter@latest screeps-sc-firefox.zip
