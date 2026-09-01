#!/usr/bin/env bash
set -euo pipefail

: "${APPLE_CERTIFICATE:?APPLE_CERTIFICATE is required}"
: "${APPLE_CERTIFICATE_PASSWORD:?APPLE_CERTIFICATE_PASSWORD is required}"
: "${APPLE_INSTALLER_CERTIFICATE:?APPLE_INSTALLER_CERTIFICATE is required}"
: "${APPLE_INSTALLER_CERTIFICATE_PASSWORD:?APPLE_INSTALLER_CERTIFICATE_PASSWORD is required}"
: "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY is required}"
: "${APPLE_INSTALLER_SIGNING_IDENTITY:?APPLE_INSTALLER_SIGNING_IDENTITY is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

keychain_path="$RUNNER_TEMP/statusline-signing.keychain-db"
application_p12="$RUNNER_TEMP/statusline-application.p12"
installer_p12="$RUNNER_TEMP/statusline-installer.p12"
keychain_password=$(openssl rand -hex 32)
prepared=false

cleanup_on_error() {
  rm -f "$application_p12" "$installer_p12"
  if [[ "$prepared" != true && -f "$keychain_path" ]]; then
    security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  fi
}
trap cleanup_on_error EXIT

printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$application_p12"
printf '%s' "$APPLE_INSTALLER_CERTIFICATE" | base64 --decode > "$installer_p12"
chmod 600 "$application_p12" "$installer_p12"

security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 21600 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"

security import "$application_p12" \
  -k "$keychain_path" \
  -P "$APPLE_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security
security import "$installer_p12" \
  -k "$keychain_path" \
  -P "$APPLE_INSTALLER_CERTIFICATE_PASSWORD" \
  -T /usr/bin/pkgbuild \
  -T /usr/bin/productbuild \
  -T /usr/bin/productsign \
  -T /usr/bin/security

security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$keychain_password" \
  "$keychain_path"

existing_keychains=()
while IFS= read -r existing_keychain; do
  existing_keychain=${existing_keychain//\"/}
  if [[ -n "$existing_keychain" && "$existing_keychain" != "$keychain_path" ]]; then
    existing_keychains+=("$existing_keychain")
  fi
done < <(security list-keychains -d user)

security list-keychains -d user -s "$keychain_path" "${existing_keychains[@]}"
security default-keychain -d user -s "$keychain_path"

identities=$(security find-identity -v "$keychain_path")
if [[ "$identities" != *"$APPLE_SIGNING_IDENTITY"* ]]; then
  echo "Developer ID Application identity was not imported." >&2
  exit 1
fi
if [[ "$identities" != *"$APPLE_INSTALLER_SIGNING_IDENTITY"* ]]; then
  echo "Developer ID Installer identity was not imported." >&2
  exit 1
fi

rm -f "$application_p12" "$installer_p12"
printf 'keychain-path=%s\n' "$keychain_path" >> "$GITHUB_OUTPUT"
prepared=true

echo "Developer ID Application and Installer identities are ready."
