#!/usr/bin/env bash
set -euo pipefail

dmg_path=${1:?'Usage: package-macos-updater.sh <final-dmg> <output-directory> <version>'}
output_directory=${2:?'Missing output directory'}
version=${3:?'Missing version'}
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo "Invalid updater version." >&2; exit 1; }
[[ "$dmg_path" == *.dmg && -f "$dmg_path" && ! -L "$dmg_path" ]] || { echo "Expected final DMG." >&2; exit 1; }

# Reuse the final app from the distribution DMG. Tauri may remove the temporary
# .app after building a DMG; an earlier build-directory copy is not authoritative.
hdiutil verify "$dmg_path"
codesign --verify --strict --verbose=2 "$dmg_path"
xcrun stapler validate "$dmg_path"
spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg_path"
temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/statusline-macos-updater.XXXXXX")
mount_point="$temporary_root/mounted"
mounted=false
cleanup() {
  if [[ "$mounted" == true ]]; then hdiutil detach "$mount_point" -force >/dev/null 2>&1 || true; fi
  rm -rf "$temporary_root"
}
trap cleanup EXIT
mkdir -p "$mount_point" "$output_directory" "$temporary_root/verify"
hdiutil attach "$dmg_path" -readonly -nobrowse -mountpoint "$mount_point" >/dev/null
mounted=true
app_name='Statusline Companion.app'
app_path="$mount_point/$app_name"
[[ -d "$app_path" && ! -L "$app_path" ]] || { echo "Expected app missing from final DMG." >&2; exit 1; }

verify_app() {
  local app=$1
  [[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist") == "$version" ]] || { echo "Updater app version mismatch." >&2; exit 1; }
  [[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist") == inmerzion.statusline.desktop ]] || { echo "Updater app identifier mismatch." >&2; exit 1; }
  local executable
  executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
  [[ "$executable" != */* && -n "$executable" ]] || exit 1
  lipo -verify_arch arm64 x86_64 "$app/Contents/MacOS/$executable"
  codesign --verify --deep --strict --verbose=2 "$app"
  xcrun stapler validate "$app"
  spctl --assess --type execute --verbose=4 "$app"
}
verify_app "$app_path"
archive="$output_directory/Statusline Companion_${version}_universal.app.tar.gz"
[[ ! -e "$archive" && ! -e "$archive.sig" ]] || { echo "Refusing to replace an existing updater archive." >&2; exit 1; }
# Match Tauri's archive layout: one .app root, executable modes and symlinks.
# Apple's ._* sidecars are not interpreted by the plugin's Rust tar extractor.
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$temporary_root/payload.app.tar.gz" -C "$mount_point" "$app_name"
tar -tzf "$temporary_root/payload.app.tar.gz" > "$temporary_root/archive-files.txt"
while IFS= read -r entry; do
  case "$entry" in
    "$app_name" | "$app_name/"*) ;;
    *) echo "Unexpected updater archive root: $entry" >&2; exit 1 ;;
  esac
done < "$temporary_root/archive-files.txt"
tar -xzf "$temporary_root/payload.app.tar.gz" -C "$temporary_root/verify"
verify_app "$temporary_root/verify/$app_name"
mv "$temporary_root/payload.app.tar.gz" "$archive"
echo "Prepared verified final universal macOS updater payload."
