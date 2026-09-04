#!/bin/zsh

set -euo pipefail

chrome_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
gallery_root="${0:A:h}"
screenshot_root="${gallery_root}/screenshots"
profile_root="$(mktemp -d /private/tmp/statusline-amber-gallery.XXXXXX)"

cleanup_profiles() {
  if [[ "${profile_root}" == /private/tmp/statusline-amber-gallery.* ]]; then
    rm -rf -- "${profile_root}"
  fi
}
trap cleanup_profiles EXIT

render_one() {
  local source_file="$1"
  local output_file="$2"
  local viewport="$3"
  local profile_name="$4"
  local output_path="${screenshot_root}/${output_file}"
  local log_file="/private/tmp/${profile_name}.log"

  rm -f "${output_path}"

  "${chrome_path}" \
    --headless=new \
    --disable-gpu \
    --no-sandbox \
    --hide-scrollbars \
    --disable-background-networking \
    --disable-component-update \
    --disable-default-apps \
    --disable-extensions \
    --disable-sync \
    --no-first-run \
    --force-device-scale-factor=1 \
    --window-size="${viewport}" \
    --user-data-dir="${profile_root}/${profile_name}" \
    --screenshot="${output_path}" \
    "file://${gallery_root}/${source_file}" \
    >"${log_file}" 2>&1 &

  local chrome_job=$!
  local attempt
  for attempt in {1..120}; do
    if [[ -s "${output_path}" ]]; then
      break
    fi
    if ! kill -0 "${chrome_job}" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done

  if kill -0 "${chrome_job}" 2>/dev/null; then
    kill -TERM "${chrome_job}" 2>/dev/null || true
  fi
  wait "${chrome_job}" 2>/dev/null || true

  if [[ ! -s "${output_path}" ]]; then
    tail -n 20 "${log_file}" >&2
    return 1
  fi

  print -r -- "rendered ${output_file}"
}

if [[ "${1:-all}" == "qa09" ]]; then
  render_one "direction-09-reset-chronograph.html" "direction-09-desktop.png" "1440,1000" "statusline-amber-d9d"
  render_one "gallery.html" "gallery-desktop.png" "1440,1000" "statusline-amber-gallery"
  exit 0
fi

render_one "direction-07-operator-zero.html" "direction-07-desktop.png" "1440,1000" "statusline-amber-d7d"
render_one "direction-07-operator-zero.html" "direction-07-mobile.png" "390,844" "statusline-amber-d7m"
render_one "direction-08-telemetry-grid.html" "direction-08-desktop.png" "1440,1000" "statusline-amber-d8d"
render_one "direction-08-telemetry-grid.html" "direction-08-mobile.png" "390,844" "statusline-amber-d8m"
render_one "direction-09-reset-chronograph.html" "direction-09-desktop.png" "1440,1000" "statusline-amber-d9d"
render_one "direction-09-reset-chronograph.html" "direction-09-mobile.png" "390,844" "statusline-amber-d9m"
render_one "gallery.html" "gallery-desktop.png" "1440,1000" "statusline-amber-gallery"
