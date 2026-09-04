#!/usr/bin/env bash

set -euo pipefail

public_key_path=${1:-}

if [[ -z "$public_key_path" || ! -f "$public_key_path" ]]; then
  echo "Usage: prepare-linux-signing.sh <public-key.asc>" >&2
  exit 1
fi

for command_name in base64 gpg mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Linux signing requires $command_name." >&2
    exit 1
  fi
done

: "${LINUX_GPG_PRIVATE_KEY_BASE64:?Set LINUX_GPG_PRIVATE_KEY_BASE64.}"
: "${LINUX_GPG_PASSPHRASE:?Set LINUX_GPG_PASSPHRASE.}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required.}"
: "${GITHUB_ENV:?GITHUB_ENV is required.}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required.}"

gnupg_home=$(mktemp -d "$RUNNER_TEMP/statusline-gnupg.XXXXXX")
private_key_path="$gnupg_home/private-key.asc"
probe_path="$gnupg_home/signing-probe.txt"
probe_signature_path="$probe_path.asc"

cleanup_on_exit() {
  status=$?
  rm -f -- "$private_key_path" "$probe_path" "$probe_signature_path"
  if [[ $status -ne 0 ]]; then
    gpgconf --homedir "$gnupg_home" --kill gpg-agent >/dev/null 2>&1 || true
    rm -rf -- "$gnupg_home"
  fi
}
trap cleanup_on_exit EXIT

chmod 700 "$gnupg_home"
printf '%s' "$LINUX_GPG_PRIVATE_KEY_BASE64" | base64 --decode > "$private_key_path"
chmod 600 "$private_key_path"

public_fingerprint=$(
  gpg --batch --homedir "$gnupg_home" --with-colons --show-keys "$public_key_path" 2>/dev/null |
    awk -F: '$1 == "fpr" { print toupper($10); exit }'
)
if [[ -z "$public_fingerprint" ]]; then
  echo "The committed Linux public key has no readable fingerprint." >&2
  exit 1
fi

gpg --batch --homedir "$gnupg_home" --import "$private_key_path" >/dev/null 2>&1
secret_fingerprint=$(
  gpg --batch --homedir "$gnupg_home" --with-colons --list-secret-keys 2>/dev/null |
    awk -F: '$1 == "fpr" { print toupper($10); exit }'
)
if [[ -z "$secret_fingerprint" ]]; then
  echo "The Linux signing secret does not contain a private key." >&2
  exit 1
fi
if [[ "$secret_fingerprint" != "$public_fingerprint" ]]; then
  echo "The Linux private key does not match the committed public key." >&2
  exit 1
fi

printf 'Statusline Linux signing preflight\n' > "$probe_path"
printf '%s' "$LINUX_GPG_PASSPHRASE" | gpg \
  --batch \
  --yes \
  --no-tty \
  --homedir "$gnupg_home" \
  --pinentry-mode loopback \
  --passphrase-fd 0 \
  --local-user "$secret_fingerprint" \
  --armor \
  --detach-sign \
  --output "$probe_signature_path" \
  "$probe_path"
gpg --batch --no-tty --homedir "$gnupg_home" --verify "$probe_signature_path" "$probe_path"

rm -f -- "$private_key_path" "$probe_path" "$probe_signature_path"
{
  echo "STATUSLINE_LINUX_GNUPGHOME=$gnupg_home"
  echo "STATUSLINE_LINUX_GPG_FINGERPRINT=$secret_fingerprint"
} >> "$GITHUB_ENV"
{
  echo "gnupg-home=$gnupg_home"
  echo "fingerprint=$secret_fingerprint"
} >> "$GITHUB_OUTPUT"

trap - EXIT
echo "Linux signing key ready: $secret_fingerprint"
