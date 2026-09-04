#!/usr/bin/env bash

set -euo pipefail

gnupg_home=${1:-}
if [[ -z "$gnupg_home" ]]; then
  exit 0
fi

: "${RUNNER_TEMP:?RUNNER_TEMP is required.}"
case "$gnupg_home" in
  "$RUNNER_TEMP"/statusline-gnupg.*) ;;
  *)
    echo "Refusing to remove an unexpected Linux signing directory: $gnupg_home" >&2
    exit 1
    ;;
esac

if [[ -d "$gnupg_home" ]]; then
  gpgconf --homedir "$gnupg_home" --kill gpg-agent >/dev/null 2>&1 || true
  chmod -R u+rwX "$gnupg_home"
  rm -rf -- "$gnupg_home"
fi
