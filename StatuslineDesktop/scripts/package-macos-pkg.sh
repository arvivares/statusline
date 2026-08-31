#!/usr/bin/env bash
set -euo pipefail

app_path=${1:?'Usage: package-macos-pkg.sh <app-path> <output-directory> <version>'}
output_directory=${2:?'Usage: package-macos-pkg.sh <app-path> <output-directory> <version>'}
version=${3:?'Usage: package-macos-pkg.sh <app-path> <output-directory> <version>'}
require_trust=${STATUSLINE_REQUIRE_MACOS_TRUST:-false}

if [[ ! -d "$app_path" ]]; then
  echo "Application bundle not found: $app_path" >&2
  exit 1
fi
if [[ "$require_trust" != true && "$require_trust" != false ]]; then
  echo "STATUSLINE_REQUIRE_MACOS_TRUST must be true or false." >&2
  exit 1
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
