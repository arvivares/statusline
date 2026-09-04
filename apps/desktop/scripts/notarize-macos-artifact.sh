#!/usr/bin/env bash
set -euo pipefail

artifact_path=${1:?'Usage: notarize-macos-artifact.sh <dmg-or-pkg-path>'}
if [[ ! -f "$artifact_path" ]]; then
  echo "macOS artifact not found: $artifact_path" >&2
  exit 1
fi

case "$artifact_path" in
  *.dmg | *.pkg) ;;
  *)
    echo "Only DMG and PKG artifacts are supported." >&2
    exit 1
    ;;
esac

auth_args=()
if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
  if [[ ! -f "$APPLE_API_KEY_PATH" ]]; then
    echo "App Store Connect private key not found: $APPLE_API_KEY_PATH" >&2
    exit 1
  fi
  auth_args=(
    --key "$APPLE_API_KEY_PATH"
    --key-id "$APPLE_API_KEY"
    --issuer "$APPLE_API_ISSUER"
  )
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  auth_args=(
    --apple-id "$APPLE_ID"
    --password "$APPLE_PASSWORD"
    --team-id "$APPLE_TEAM_ID"
  )
else
  echo "Missing Apple ID or App Store Connect notarization credentials." >&2
  exit 1
fi

echo "Submitting $(basename "$artifact_path") to Apple's notary service..."
xcrun notarytool submit "$artifact_path" \
  "${auth_args[@]}" \
  --wait \
  --timeout 20m \
  --output-format json

xcrun stapler staple -v "$artifact_path"
xcrun stapler validate "$artifact_path"

case "$artifact_path" in
  *.dmg)
    codesign --verify --strict --verbose=2 "$artifact_path"
    spctl --assess \
      --type open \
      --context context:primary-signature \
      --verbose=4 \
      "$artifact_path"
    ;;
  *.pkg)
    pkgutil --check-signature "$artifact_path"
    spctl --assess --type install --verbose=4 "$artifact_path"
    ;;
esac

echo "macOS artifact notarized, stapled and accepted by Gatekeeper."
