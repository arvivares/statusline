#!/bin/zsh

set -euo pipefail

chrome_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
gallery_root="${0:A:h}"
screenshot_root="${gallery_root}/screenshots"
profile_root="$(mktemp -d /private/tmp/statusline-terminal-gallery.XXXXXX)"

cleanup_profiles() {
  if [[ "${profile_root}" == /private/tmp/statusline-terminal-gallery.* ]]; then
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

render_one "direction-04-phosphor-console.html" "direction-04-desktop.png" "1440,1000" "statusline-terminal-d4d"
render_one "direction-04-phosphor-console.html" "direction-04-mobile.png" "390,844" "statusline-terminal-d4m"
render_one "direction-05-midnight-ledger.html" "direction-05-desktop.png" "1440,1000" "statusline-terminal-d5d"
render_one "direction-05-midnight-ledger.html" "direction-05-mobile.png" "390,844" "statusline-terminal-d5m"
render_one "direction-06-amber-operator.html" "direction-06-desktop.png" "1440,1000" "statusline-terminal-d6d"
render_one "direction-06-amber-operator.html" "direction-06-mobile.png" "390,844" "statusline-terminal-d6m"
render_one "gallery.html" "gallery-desktop.png" "1440,1000" "statusline-terminal-gallery"
