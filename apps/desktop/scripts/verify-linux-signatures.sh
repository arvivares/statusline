#!/usr/bin/env bash

set -euo pipefail

bundle_root=${1:-}
public_key_path=${2:-}

if [[ -z "$bundle_root" || ! -d "$bundle_root" || -z "$public_key_path" || ! -f "$public_key_path" ]]; then
  echo "Usage: verify-linux-signatures.sh <bundle-root> <public-key.asc>" >&2
  exit 1
fi

for command_name in find gpg grep mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Linux signature verification requires $command_name." >&2
    exit 1
  fi
done

temporary_root=${RUNNER_TEMP:-${TMPDIR:-/tmp}}
gnupg_home=$(mktemp -d "$temporary_root/statusline-gpg-verify.XXXXXX")
cleanup() {
  gpgconf --homedir "$gnupg_home" --kill gpg-agent >/dev/null 2>&1 || true
  rm -rf -- "$gnupg_home"
}
trap cleanup EXIT
chmod 700 "$gnupg_home"

expected_fingerprint=$(
  gpg --batch --homedir "$gnupg_home" --with-colons --show-keys "$public_key_path" 2>/dev/null |
    awk -F: '$1 == "fpr" { print toupper($10); exit }'
)
if [[ -z "$expected_fingerprint" ]]; then
  echo "The Linux public key has no readable fingerprint." >&2
  exit 1
fi

gpg --batch --homedir "$gnupg_home" --import "$public_key_path" >/dev/null 2>&1
installer_paths=()
while IFS= read -r -d '' installer_path; do
  installer_paths+=("$installer_path")
done < <(
  find "$bundle_root" -type f \( \
    -iname '*.deb' -o \
    -iname '*.rpm' -o \
    -iname '*.appimage' \
  \) -print0
)

deb_count=0
rpm_count=0
appimage_count=0
for installer_path in "${installer_paths[@]}"; do
  case "$installer_path" in
    *.deb) deb_count=$((deb_count + 1)) ;;
    *.rpm) rpm_count=$((rpm_count + 1)) ;;
    *.AppImage | *.appimage) appimage_count=$((appimage_count + 1)) ;;
  esac
done
if [[ $deb_count -ne 1 || $rpm_count -ne 1 || $appimage_count -ne 1 ]]; then
  echo "Expected exactly one DEB, one RPM and one AppImage; found ${#installer_paths[@]}." >&2
  exit 1
fi

for installer_path in "${installer_paths[@]}"; do
  signature_path="$installer_path.asc"
  if [[ ! -f "$signature_path" ]]; then
    signature_paths=()
    while IFS= read -r -d '' candidate_path; do
      signature_paths+=("$candidate_path")
    done < <(find "$bundle_root" -type f -name "$(basename "$installer_path").asc" -print0)
    if [[ ${#signature_paths[@]} -ne 1 ]]; then
      echo "Missing or ambiguous detached signature for: $installer_path" >&2
      exit 1
    fi
    signature_path=${signature_paths[0]}
  fi
  verification_output=$(gpg \
    --batch \
    --no-tty \
    --status-fd 1 \
    --homedir "$gnupg_home" \
    --verify "$signature_path" "$installer_path" 2>/dev/null)
  if ! grep -Fq "[GNUPG:] VALIDSIG $expected_fingerprint" <<< "$verification_output"; then
    echo "Signature was not made by the expected key: $installer_path" >&2
    exit 1
  fi
done

echo "Verified three Linux installers with OpenPGP key $expected_fingerprint."
