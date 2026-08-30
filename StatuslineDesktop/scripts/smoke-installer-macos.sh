#!/usr/bin/env bash
set -euo pipefail

bundle_root=${1:?"Usage: smoke-installer-macos.sh <bundle-directory>"}
dmg_files=()
while IFS= read -r path; do
  dmg_files+=("$path")
done < <(find "$bundle_root" -type f -name '*.dmg' -print)

if [[ ${#dmg_files[@]} -ne 1 ]]; then
  echo "Expected one DMG in $bundle_root, found ${#dmg_files[@]}" >&2
  exit 1
fi

temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/statusline-macos-smoke.XXXXXX")
mount_point="$temporary_root/mounted"
mounted=false

cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_point" -force >/dev/null 2>&1 || true
  fi
  rm -rf "$temporary_root"
}
trap cleanup EXIT

mkdir -p "$mount_point"
hdiutil attach "${dmg_files[0]}" -readonly -nobrowse -mountpoint "$mount_point" >/dev/null
mounted=true

app_path="$mount_point/Statusline Companion.app"
binary_path="$app_path/Contents/MacOS/statusline-desktop"
icon_path="$app_path/Contents/Resources/icon.icns"
if [[ ! -x "$binary_path" ]]; then
  echo "The DMG does not contain the Statusline application binary." >&2
  exit 1
fi
if [[ ! -f "$icon_path" ]]; then
  echo "The macOS application icon is missing." >&2
  exit 1
fi

architectures=$(lipo -archs "$binary_path")
if [[ " $architectures " != *" arm64 "* || " $architectures " != *" x86_64 "* ]]; then
  echo "Expected a universal arm64+x86_64 binary, found: $architectures" >&2
  exit 1
fi

codex_fixture="$temporary_root/codex"
diagnostic_path="$temporary_root/codex-diagnostic.json"
printf '%s\n' \
  '#!/bin/sh' \
  'if [ "$1" = "--version" ]; then' \
  '  echo "codex-cli 0.0.0-statusline-smoke"' \
  '  exit 0' \
  'fi' \
  'exit 2' >"$codex_fixture"
chmod +x "$codex_fixture"

STATUSLINE_CODEX_PATH="$codex_fixture" \
  "$binary_path" --statusline-codex-diagnostic "$diagnostic_path"
node -e '
  const fs = require("node:fs");
  const [diagnosticPath, expectedPath] = process.argv.slice(1);
  const diagnostic = JSON.parse(fs.readFileSync(diagnosticPath, "utf8"));
  if (diagnostic.status !== "ready") throw new Error(JSON.stringify(diagnostic));
  if (fs.realpathSync(diagnostic.path) !== fs.realpathSync(expectedPath)) {
    throw new Error(`Unexpected Codex path: ${diagnostic.path}`);
  }
' "$diagnostic_path" "$codex_fixture"

echo "macOS DMG smoke passed: $architectures, icon present, Codex detected."
