#!/usr/bin/env bash

set -euo pipefail

[[ $(uname -s) == Linux && $(id -u) != 0 ]] || { echo 'Use a non-root Linux CI user.' >&2; exit 1; }

if [[ $# -ne 1 ]]; then
  echo "Usage: smoke-installers-linux.sh <bundle-root>" >&2
  exit 2
fi

bundle_root=$(realpath "$1")
script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)

find_single_bundle() {
  local pattern=$1
  local label=$2
  local matches=()
  while IFS= read -r -d '' match; do
    matches+=("$match")
  done < <(find "$bundle_root" -type f -name "$pattern" -print0)
  if [[ ${#matches[@]} -ne 1 ]]; then
    echo "Expected one ${label} in ${bundle_root}, found ${#matches[@]}" >&2
    exit 1
  fi
  realpath "${matches[0]}"
}

deb=$(find_single_bundle "*.deb" "Debian package")
rpm=$(find_single_bundle "*.rpm" "RPM package")
appimage=$(find_single_bundle "*.AppImage" "AppImage")
package_name=$(dpkg-deb -f "$deb" Package)
[[ $package_name == statusline-companion ]] || { echo 'Unexpected Debian package identity.' >&2; exit 1; }
existing_status=$(dpkg-query -W -f='${Status}' "$package_name" 2>/dev/null || true)
[[ $existing_status != 'install ok installed' ]] || { echo 'Do not replace an existing Statusline installation. Use a clean CI runner.' >&2; exit 1; }
installed_package=""
extract_directory=$(mktemp -d)

cleanup() {
  local smoke_status=$?
  if [[ -n "$installed_package" ]]; then
    sudo apt-get remove -y "$installed_package" >/dev/null || true
  fi
  printf 'Private extracted AppImage evidence: %s\n' "$extract_directory"
  exit "$smoke_status"
}
trap cleanup EXIT

dpkg-deb --info "$deb" >/dev/null
rpm -qip "$rpm" >/dev/null
file "$appimage" | grep -q "ELF"

chmod +x "$appimage"
(
  cd "$extract_directory"
  "$appimage" --appimage-extract >/dev/null
)
test -x "$extract_directory/squashfs-root/AppRun"
node "$script_directory/prepare-appimage-linux.mjs" --verify-appdir "$extract_directory/squashfs-root"

sudo apt-get install -y "$deb" >/dev/null
installed_package="$package_name"
binary=$(dpkg -L "$package_name" | awk '/\/bin\// { print; exit }')
if [[ -z "$binary" ]] || [[ ! -x "$binary" ]]; then
  echo "Installed package did not provide an executable" >&2
  exit 1
fi

bash "$script_directory/smoke-frontend-linux.sh" "$binary"
# Launch the AppImage's own runtime (FUSE-free extraction mode), not the DEB
# executable or a manually adjusted inner binary. Both need the IPC marker.
bash "$script_directory/smoke-frontend-linux.sh" "$appimage"

sudo apt-get remove -y "$package_name" >/dev/null
installed_package=""
package_status=$(dpkg-query -W -f='${Status}' "$package_name" 2>/dev/null || true)
if [[ "$package_status" == "install ok installed" ]]; then
  echo "Debian package remained installed after uninstall" >&2
  exit 1
fi

echo "Linux installer smoke tests passed."
