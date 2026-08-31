#!/usr/bin/env bash
set -euo pipefail

source_path=${1:?'Usage: package-macos-pkg.sh <app-or-dmg-path> <output-directory> <version>'}
output_directory=${2:?'Usage: package-macos-pkg.sh <app-or-dmg-path> <output-directory> <version>'}
version=${3:?'Usage: package-macos-pkg.sh <app-or-dmg-path> <output-directory> <version>'}
require_trust=${STATUSLINE_REQUIRE_MACOS_TRUST:-false}

if [[ "$require_trust" != true && "$require_trust" != false ]]; then
  echo "STATUSLINE_REQUIRE_MACOS_TRUST must be true or false." >&2
  exit 1
fi

temporary_root=""
mount_point=""
mounted=false

cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_point" -force >/dev/null 2>&1 || true
  fi
  if [[ -n "$temporary_root" && -d "$temporary_root" ]]; then
    rm -rf "$temporary_root"
  fi
}
trap cleanup EXIT

if [[ -d "$source_path" && "$source_path" == *.app ]]; then
  app_path="$source_path"
elif [[ -f "$source_path" && "$source_path" == *.dmg ]]; then
  hdiutil verify "$source_path"
  temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/statusline-macos-pkg.XXXXXX")
  mount_point="$temporary_root/mounted"
  mkdir -p "$mount_point"
  hdiutil attach "$source_path" -readonly -nobrowse -mountpoint "$mount_point" >/dev/null
  mounted=true
  app_path="$mount_point/Statusline Companion.app"
else
  echo "Application bundle or DMG not found: $source_path" >&2
  exit 1
fi

if [[ ! -d "$app_path" ]]; then
  echo "Statusline application bundle not found in source: $source_path" >&2
  exit 1
fi

if [[ "$require_trust" == true ]]; then
  codesign --verify --deep --strict --verbose=2 "$app_path"
  xcrun stapler validate "$app_path"
  spctl --assess --type execute --verbose=4 "$app_path"
fi

mkdir -p "$output_directory"
pkg_path="$output_directory/Statusline Companion_${version}_universal.pkg"

productbuild_args=(--component "$app_path" /Applications)
if [[ "$require_trust" == true ]]; then
  : "${APPLE_INSTALLER_SIGNING_IDENTITY:?APPLE_INSTALLER_SIGNING_IDENTITY is required}"
  productbuild_args=(--sign "$APPLE_INSTALLER_SIGNING_IDENTITY" "${productbuild_args[@]}")
fi

productbuild "${productbuild_args[@]}" "$pkg_path"

if [[ "$require_trust" == true ]]; then
  signature_details=$(pkgutil --check-signature "$pkg_path" 2>&1)
  echo "$signature_details"
  if [[ "$signature_details" != *"Developer ID Installer:"* || "$signature_details" != *"Signed with a trusted timestamp"* ]]; then
    echo "The PKG does not have the expected Developer ID Installer signature and timestamp." >&2
    exit 1
  fi
fi

echo "macOS PKG created: $pkg_path"
