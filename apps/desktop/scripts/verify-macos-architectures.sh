#!/usr/bin/env bash
set -euo pipefail

binary_path=${1:?'Usage: verify-macos-architectures.sh <universal-executable>'}
[[ -f "$binary_path" && ! -L "$binary_path" ]] || { echo "Expected a regular universal executable." >&2; exit 1; }

# Current Apple toolchains accept one architecture per -verify_arch check.
# Keep the path as one quoted argument so spaces and Unicode remain valid.
for architecture in arm64 x86_64; do
  /usr/bin/lipo "$binary_path" -verify_arch "$architecture"
done
