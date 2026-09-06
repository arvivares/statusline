#!/usr/bin/env bash

# CI-only readiness check. Xvfb/software EGL is not a physical GPU validation.
set -euo pipefail
[[ $# -eq 1 ]] || { echo 'Usage: smoke-frontend-linux.sh <executable-or-AppImage>' >&2; exit 2; }
[[ $(uname -s) == Linux && $(id -u) != 0 ]] || { echo 'Use a non-root Linux user.' >&2; exit 1; }
for tool in realpath setsid dbus-run-session xvfb-run pgrep; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done
executable=$(realpath -- "$1")
[[ -f $executable && -x $executable ]] || { echo 'Expected an executable file.' >&2; exit 1; }
process_status=0
pgrep -u "$(id -u)" -f '(^|/)statusline-desktop([[:space:]]|$)' >/dev/null || process_status=$?
[[ $process_status == 1 ]] || { echo 'Quit Statusline first, or investigate the failed process check.' >&2; exit 1; }
umask 077
smoke_directory=$(mktemp -d "${TMPDIR:-/tmp}/statusline-frontend-smoke.XXXXXX")
mkdir "$smoke_directory/config" "$smoke_directory/data" "$smoke_directory/cache"
marker="$smoke_directory/ready"
app_pid=""
cleanup() {
  local smoke_status=$?
  if [[ -n $app_pid ]]; then
    kill -TERM -- "-$app_pid" 2>/dev/null || true
    sleep 1
    kill -KILL -- "-$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  # Retain private evidence, never publish logs or remove user app profiles.
  printf 'Private readiness evidence: %s\n' "$smoke_directory"
  exit "$smoke_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

setsid env -u GIO_MODULE_DIR -u GIO_EXTRA_MODULES -u GIO_USE_VFS \
  -u LD_LIBRARY_PATH -u LD_PRELOAD -u LD_DEBUG -u LD_DEBUG_OUTPUT \
  -u APPDIR -u APPIMAGE -u WAYLAND_DISPLAY -u GDK_BACKEND \
  -u WEBKIT_DISABLE_DMABUF_RENDERER -u WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS \
  -u GST_PLUGIN_SYSTEM_PATH -u GST_PLUGIN_SYSTEM_PATH_1_0 \
  APPIMAGE_EXTRACT_AND_RUN=1 STATUSLINE_RELAY_BASE_URL= LIBGL_ALWAYS_SOFTWARE=true \
  "XDG_CONFIG_HOME=$smoke_directory/config" "XDG_DATA_HOME=$smoke_directory/data" \
  "XDG_CACHE_HOME=$smoke_directory/cache" "GST_REGISTRY=$smoke_directory/cache/gstreamer.bin" \
  "GST_REGISTRY_1_0=$smoke_directory/cache/gstreamer.bin" \
  dbus-run-session -- xvfb-run -a "$executable" --statusline-window-smoke "$marker" \
  > "$smoke_directory/startup.log" 2>&1 &
app_pid=$!

ready=false
for ((attempt = 0; attempt < 150; attempt++)); do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    echo 'Application exited before frontend readiness.' >&2
    exit 1
  fi
  if [[ -f $marker && ! -L $marker ]] && grep -qx 'ready' "$marker"; then
    ready=true
    break
  fi
  sleep 0.2
done
[[ $ready == true ]] || { echo 'Frontend did not initialize within 30 seconds (a live parent is not a pass).' >&2; exit 1; }
sleep 2
kill -0 "$app_pid" 2>/dev/null || { echo 'Application exited immediately after readiness.' >&2; exit 1; }
if grep -qE 'EGL_BAD_PARAMETER|undefined symbol: (g_task_set_static_name|wl_fixes_interface)' "$smoke_directory/startup.log"; then
  echo 'Known AppImage compatibility error detected despite the readiness marker.' >&2
  exit 1
fi
echo 'Frontend initialized and IPC handshake succeeded; physical rendering and pairing remain separate QA checks.'
