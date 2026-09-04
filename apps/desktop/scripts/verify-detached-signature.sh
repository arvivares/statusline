#!/usr/bin/env bash

set -euo pipefail

file_path=${1:-}
signature_path=${2:-}
public_key_path=${3:-}

if [[ -z "$file_path" || ! -f "$file_path" || -z "$signature_path" || ! -f "$signature_path" || -z "$public_key_path" || ! -f "$public_key_path" ]]; then
  echo "Usage: verify-detached-signature.sh <file> <signature.asc> <public-key.asc>" >&2
  exit 1
fi

temporary_root=${RUNNER_TEMP:-${TMPDIR:-/tmp}}
gnupg_home=$(mktemp -d "$temporary_root/statusline-signature-verify.XXXXXX")
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
  echo "The public key has no readable fingerprint." >&2
  exit 1
fi

gpg --batch --homedir "$gnupg_home" --import "$public_key_path" >/dev/null 2>&1
verification_output=$(gpg \
  --batch \
  --no-tty \
  --status-fd 1 \
  --homedir "$gnupg_home" \
  --verify "$signature_path" "$file_path" 2>/dev/null)
if ! grep -Fq "[GNUPG:] VALIDSIG $expected_fingerprint" <<< "$verification_output"; then
  echo "Signature was not made by the expected key: $file_path" >&2
  exit 1
fi

echo "Verified $(basename "$file_path") with OpenPGP key $expected_fingerprint."
