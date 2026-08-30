#!/bin/zsh

set -euo pipefail

chrome_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
gallery_root="/Users/cuquito/apps/statusline/docs/ui-design/statusline-refresh"
screenshot_root="${gallery_root}/screenshots"

render_one() {
  local source_file="$1"
  local output_file="$2"
  local viewport="$3"
  local profile_name="$4"
  local log_file="/private/tmp/statusline-${profile_name}.log"

  rm -f "${screenshot_root}/${output_file}"

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
    --user-data-dir="/private/tmp/${profile_name}" \
    --screenshot="${screenshot_root}/${output_file}" \
    "file://${gallery_root}/${source_file}" \
    >"${log_file}" 2>&1 &

  local chrome_job=$!
  local attempt
  for attempt in {1..120}; do
    if [[ -s "${screenshot_root}/${output_file}" ]]; then
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

  if [[ ! -s "${screenshot_root}/${output_file}" ]]; then
    tail -n 20 "${log_file}" >&2
    return 1
  fi

  print -r -- "rendered ${output_file}"
}

render_one "direction-01-terminal-editorial.html" "direction-01-mobile.png" "390,844" "statusline-gallery-d1m"
render_one "direction-02-quiet-native.html" "direction-02-desktop.png" "1440,1000" "statusline-gallery-d2d"
render_one "direction-02-quiet-native.html" "direction-02-mobile.png" "390,844" "statusline-gallery-d2m"
render_one "direction-03-swiss-instrument.html" "direction-03-desktop.png" "1440,1000" "statusline-gallery-d3d"
render_one "direction-03-swiss-instrument.html" "direction-03-mobile.png" "390,844" "statusline-gallery-d3m"
render_one "gallery.html" "gallery-desktop.png" "1440,1000" "statusline-gallery-index"
