#!/usr/bin/env bash

set -euo pipefail

mapping_file="${1:?Usage: verify-r8-registrars.sh <mapping.txt>}"
[[ -s "$mapping_file" ]] || {
  echo "R8 mapping file is missing or empty: $mapping_file" >&2
  exit 1
}

registrars=(
  "com.google.mlkit.common.internal.CommonComponentRegistrar"
  "com.google.mlkit.vision.barcode.internal.BarcodeRegistrar"
  "com.google.mlkit.vision.common.internal.VisionCommonRegistrar"
)

for registrar in "${registrars[@]}"; do
  if ! awk -v registrar="$registrar" '
    index($0, registrar " -> ") == 1 {
      in_registrar = 1
      found_registrar = 1
      next
    }
    in_registrar && $0 !~ /^[ #]/ {
      exit
    }
    in_registrar && /void <init>\(\)/ {
      found_constructor = 1
    }
    END {
      exit !(found_registrar && found_constructor)
    }
  ' "$mapping_file"; then
    echo "R8 removed the reflective constructor for $registrar" >&2
    exit 1
  fi
done

echo "ML Kit registrar constructors survived R8."
