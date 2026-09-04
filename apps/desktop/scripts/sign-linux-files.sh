#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: sign-linux-files.sh <file> [file ...]" >&2
  exit 1
fi

: "${STATUSLINE_LINUX_GNUPGHOME:?Prepare the Linux signing key first.}"
: "${STATUSLINE_LINUX_GPG_FINGERPRINT:?Prepare the Linux signing key first.}"
: "${LINUX_GPG_PASSPHRASE:?Set LINUX_GPG_PASSPHRASE.}"

signed_count=0
for file_path in "$@"; do
  if [[ ! -f "$file_path" ]]; then
    echo "Cannot sign missing file: $file_path" >&2
    exit 1
  fi

  signature_path="$file_path.asc"
  printf '%s' "$LINUX_GPG_PASSPHRASE" | gpg \
    --batch \
    --yes \
    --no-tty \
    --homedir "$STATUSLINE_LINUX_GNUPGHOME" \
    --pinentry-mode loopback \
    --passphrase-fd 0 \
    --local-user "$STATUSLINE_LINUX_GPG_FINGERPRINT" \
    --armor \
    --detach-sign \
    --output "$signature_path" \
    "$file_path"
  gpg \
    --batch \
    --no-tty \
    --homedir "$STATUSLINE_LINUX_GNUPGHOME" \
    --verify "$signature_path" "$file_path"
  signed_count=$((signed_count + 1))
done

echo "Created and verified $signed_count OpenPGP signature(s)."
