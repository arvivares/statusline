#!/usr/bin/env bash
set -euo pipefail

keychain_path=${1:-}
if [[ -z "$keychain_path" ]]; then
  exit 0
fi

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
case "$keychain_path" in
  "$RUNNER_TEMP"/*) ;;
  *)
    echo "Refusing to remove a keychain outside RUNNER_TEMP: $keychain_path" >&2
    exit 1
    ;;
esac

if [[ -f "$keychain_path" ]]; then
  security delete-keychain "$keychain_path"
fi

echo "Temporary macOS signing keychain removed."
