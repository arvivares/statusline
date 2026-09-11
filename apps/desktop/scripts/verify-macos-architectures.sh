#!/usr/bin/env bash
set -euo pipefail

binary_path=${1:?'Usage: verify-macos-architectures.sh <universal-executable>'}
[[ -f "$binary_path" && ! -L "$binary_path" ]] || { echo "Expected a regular universal executable." >&2; exit 1; }

# -verify_arch consumes the remaining arguments as architecture names. The
# executable must precede the option, including when its path contains spaces.
/usr/bin/lipo "$binary_path" -verify_arch arm64 x86_64
