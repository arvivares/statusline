#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: smoke-installers-linux.sh <bundle-root>" >&2
  exit 2
fi

bundle_root=$(realpath "$1")

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
installed_package=""
app_pid=""
extract_directory=$(mktemp -d)

cleanup() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  if [[ -n "$installed_package" ]]; then
    sudo apt-get remove -y "$installed_package" >/dev/null
  fi
  rm -rf -- "$extract_directory"
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

sudo apt-get install -y "$deb" >/dev/null
installed_package="$package_name"
binary=$(dpkg -L "$package_name" | awk '/\/bin\// { print; exit }')
if [[ -z "$binary" ]] || [[ ! -x "$binary" ]]; then
  echo "Installed package did not provide an executable" >&2
  exit 1
fi

launch_log="$extract_directory/statusline-launch.log"
dbus-run-session -- xvfb-run -a "$binary" >"$launch_log" 2>&1 &
app_pid=$!
sleep 4
if ! kill -0 "$app_pid" 2>/dev/null; then
  echo "Statusline exited during the four-second launch smoke test" >&2
  cat "$launch_log" >&2
  exit 1
fi
kill "$app_pid" 2>/dev/null || true
wait "$app_pid" 2>/dev/null || true
app_pid=""

sudo apt-get remove -y "$package_name" >/dev/null
installed_package=""
package_status=$(dpkg-query -W -f='${Status}' "$package_name" 2>/dev/null || true)
if [[ "$package_status" == "install ok installed" ]]; then
  echo "Debian package remained installed after uninstall" >&2
  exit 1
fi

echo "Linux installer smoke tests passed."
