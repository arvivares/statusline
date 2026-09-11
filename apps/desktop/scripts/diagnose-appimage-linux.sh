#!/usr/bin/env bash

# Diagnostic experiment only: never change a published AppImage or host libraries.
set -euo pipefail

usage() {
  printf '%s\n' \
    'Usage: bash diagnose-appimage-linux.sh <AppImage> [--sha256 <digest>] [--seconds 10..60] [--trace] [--wayland-comparison | --launch-comparison]' \
    'Run on the affected Linux graphical desktop, as your normal user.' \
    'Quit Statusline from its tray menu first. Each of four cases lasts 20 seconds by default.' \
    '--wayland-comparison runs two cases with isolated GIO and requires --sha256; loader traces are automatic.' \
    '--launch-comparison compares the mounted image and unchanged extracted AppRun; requires --sha256, changes no libraries.' \
    'Logs and an extracted copy stay in a private temporary directory; nothing is uploaded.'
}

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  usage
  exit 0
fi
[[ $# -ge 1 ]] || { usage >&2; exit 2; }
appimage_argument=$1
shift
expected_sha256=""
case_seconds=20
trace=false
wayland_comparison=false
launch_comparison=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha256)
      [[ $# -ge 2 && $2 =~ ^[a-fA-F0-9]{64}$ ]] || fail '--sha256 requires a 64-character SHA-256 digest.'
      expected_sha256=$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')
      shift 2
      ;;
    --seconds)
      [[ $# -ge 2 && $2 =~ ^([1-5][0-9]|60)$ ]] || fail '--seconds must be an integer from 10 to 60.'
      case_seconds=$2
      shift 2
      ;;
    --trace) trace=true; shift ;;
    --wayland-comparison) wayland_comparison=true; trace=true; shift ;;
    --launch-comparison) launch_comparison=true; shift ;;
    *) fail "Unknown option: $1" ;;
  esac
done
if [[ $wayland_comparison == true && -z $expected_sha256 ]]; then
  fail '--wayland-comparison requires --sha256 from the verified release manifest.'
fi
if [[ $launch_comparison == true ]]; then
  [[ $wayland_comparison == false ]] || fail 'Choose only one comparison mode.'
  [[ -n $expected_sha256 ]] || fail '--launch-comparison requires --sha256 from the verified release manifest.'
fi

[[ $(uname -s) == Linux ]] || fail 'This script needs Linux; it cannot reproduce Linux rendering on macOS.'
[[ $(id -u) != 0 ]] || fail 'Do not run as root or with sudo. WebKit sandboxing must stay enabled.'
[[ -n ${DISPLAY:-} || -n ${WAYLAND_DISPLAY:-} ]] || fail 'Run from a terminal in your graphical desktop session.'
for required_command in realpath sha256sum file timeout setsid pgrep find; do
  command -v "$required_command" >/dev/null || fail "Missing tool: $required_command (no packages were installed)."
done
appimage=$(realpath -- "$appimage_argument")
[[ -f $appimage && -x $appimage ]] || fail 'Choose an existing, executable AppImage. The script does not chmod the original.'
file -b -- "$appimage" | grep -q 'ELF' || fail 'The selected file is not an ELF AppImage.'
actual_sha256=$(sha256sum -- "$appimage")
actual_sha256=${actual_sha256%% *}
if [[ -n $expected_sha256 && $actual_sha256 != "$expected_sha256" ]]; then
  fail 'SHA-256 mismatch. No application was launched or extracted.'
fi

require_no_statusline() {
  local result=0
  pgrep -u "$(id -u)" -f '(^|/)statusline-desktop([[:space:]]|$)' >/dev/null || result=$?
  [[ $result == 1 ]] || fail 'Statusline is running, or its process check failed. Quit it from the tray before continuing.'
}
require_no_statusline

umask 077
diagnostic_root=$(mktemp -d "${TMPDIR:-/tmp}/statusline-appimage-diag.XXXXXX")
mkdir "$diagnostic_root/extracted"
active_pid=""
stop_case() {
  if [[ -n $active_pid ]]; then
    # Each case owns a new session/process group. Never kill by name or touch a user's app.
    kill -TERM -- "-$active_pid" 2>/dev/null || true
    sleep 1
    kill -KILL -- "-$active_pid" 2>/dev/null || true
    wait "$active_pid" 2>/dev/null || true
    active_pid=""
  fi
}
cleanup_exit() {
  local diagnostic_exit_status=$?
  stop_case
  exit "$diagnostic_exit_status"
}
trap cleanup_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Private diagnostic directory: %s\n' "$diagnostic_root"
printf 'SHA-256: %s\n' "$actual_sha256"
printf '%s\n' 'Do not pair, disconnect, change settings or sign in during these rendering tests.'
printf '%s\n' 'Relay sync is disabled for these processes; app/cache files use temporary XDG directories.'
printf '%s\n' 'Codex may still be detected locally. Do not share unreviewed logs or screenshots.'
{
  printf 'sha256=%s\n' "$actual_sha256"
  printf 'kernel=%s\n' "$(uname -r -m)"
  printf 'session=%s\ndesktop=%s\n' "${XDG_SESSION_TYPE:-unset}" "${XDG_CURRENT_DESKTOP:-unset}"
  printf 'trace=%s\nseconds_per_case=%s\n' "$trace" "$case_seconds"
  printf 'wayland_comparison=%s\n' "$wayland_comparison"
  printf 'launch_comparison=%s\n' "$launch_comparison"
  if [[ -r /etc/os-release ]]; then
    grep -E '^(ID|VERSION_ID|PRETTY_NAME)=' /etc/os-release || true
  fi
  # Record only the presence of relevant overrides, not a full environment or private paths.
  for variable in GDK_BACKEND GIO_MODULE_DIR GIO_EXTRA_MODULES GIO_USE_VFS LIBGL_ALWAYS_SOFTWARE LD_LIBRARY_PATH LD_PRELOAD WEBKIT_DISABLE_DMABUF_RENDERER WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS GST_PLUGIN_SYSTEM_PATH GST_PLUGIN_SYSTEM_PATH_1_0 APPIMAGE_EXTRACT_AND_RUN NO_CLEANUP; do
    if [[ -n ${!variable:-} ]]; then printf '%s=present\n' "$variable"; fi
  done
} > "$diagnostic_root/environment.txt"

if ! (cd "$diagnostic_root/extracted" && env -u APPIMAGE_EXTRACT_AND_RUN -u NO_CLEANUP "$appimage" --appimage-extract) > "$diagnostic_root/extract.log" 2>&1; then
  fail "Extraction failed. Review $diagnostic_root/extract.log locally."
fi
appdir="$diagnostic_root/extracted/squashfs-root"
[[ -x $appdir/AppRun ]] || fail 'The extracted image has no executable AppRun.'
bundled_modules="$appdir/usr/lib/x86_64-linux-gnu/gio/modules"
[[ -d $bundled_modules && ! -L $bundled_modules ]] || fail 'The expected bundled GIO module directory is absent or a symlink; do not guess another path.'
[[ $(realpath -- "$bundled_modules") == "$appdir"/* ]] || fail 'Bundled modules must resolve inside the extracted image.'

if [[ -f $appdir/apprun-hooks/linuxdeploy-plugin-gtk.sh ]]; then
  cp "$appdir/apprun-hooks/linuxdeploy-plugin-gtk.sh" "$diagnostic_root/launcher-gtk.sh"
  if grep -Eq '^[[:space:]]*export[[:space:]]+GDK_BACKEND=x11' "$diagnostic_root/launcher-gtk.sh"; then
    printf '%s\n' 'This AppImage forces X11 in its GTK hook. On Wayland it requires XWayland; an external Wayland override is not a real Wayland test.'
  fi
fi
find "$appdir/usr/lib" -type f \( -name 'libgio*' -o -name 'libglib*' -o -name 'libgvfs*' -o -name 'libEGL*' -o -name 'libgbm*' -o -name 'libwayland*' \) \
  -printf '%P\n' > "$diagnostic_root/bundled-libraries.txt"

original_appdir=$appdir
case_names=(baseline gio-bundled-only software gio-bundled-only-software)
if [[ $wayland_comparison == true ]]; then
  # This allowlist is the inspected x64 0.1.12 layout, not a blanket deletion rule.
  wayland_libraries=(libwayland-client.so.0 libwayland-server.so.0 libwayland-egl.so.1 libwayland-cursor.so.0)
  [[ $(realpath -- "$original_appdir/usr/lib") == "$original_appdir/usr/lib" ]] || fail 'Unexpected symlink in the bundle library directory.'
  find "$original_appdir" -name 'libwayland-*.so*' -print0 > "$diagnostic_root/wayland-inventory.bin"
  wayland_count=0
  while IFS= read -r -d '' library; do
    relative_path=${library#"$original_appdir/"}
    case "$relative_path" in
      usr/lib/libwayland-client.so.0|usr/lib/libwayland-server.so.0|usr/lib/libwayland-egl.so.1|usr/lib/libwayland-cursor.so.0) ;;
      *) fail "Unexpected Wayland alias/location: $relative_path. Nothing was moved." ;;
    esac
    [[ -f $library && ! -L $library ]] || fail 'Unexpected Wayland symlink or non-regular file. Nothing was moved.'
    wayland_count=$((wayland_count + 1))
  done < "$diagnostic_root/wayland-inventory.bin"
  [[ $wayland_count == 4 ]] || fail 'Expected exactly four bundled Wayland libraries. Nothing was moved.'

  # Discover host candidates without overriding the dynamic linker's complete search path.
  command -v ldconfig >/dev/null || fail 'ldconfig is required for the host Wayland preflight.'
  ldconfig -p > "$diagnostic_root/host-loader-cache.txt"
  : > "$diagnostic_root/host-wayland-candidates.tsv"
  for library_name in "${wayland_libraries[@]}"; do
    host_candidate=$(awk -v name="$library_name" '$1 == name && /\(libc6,x86-64/ { print $NF; exit }' "$diagnostic_root/host-loader-cache.txt")
    [[ $host_candidate == /* && -r $host_candidate ]] || fail "No readable x86-64 host candidate for $library_name. Nothing was moved."
    resolved_candidate=$(realpath -- "$host_candidate")
    [[ $resolved_candidate != "$diagnostic_root"/* ]] || fail 'The host candidate unexpectedly resolves inside the diagnostic directory.'
    file -L -b -- "$resolved_candidate" | grep -q 'ELF' || fail 'A host Wayland candidate is not ELF.'
    printf '%s\t%s\n' "$library_name" "$resolved_candidate" >> "$diagnostic_root/host-wayland-candidates.tsv"
  done

  host_appdir="$diagnostic_root/host-wayland-appdir"
  # No hardlinks to the control copy: changing this tree must not alter the baseline.
  cp -a "$original_appdir" "$host_appdir"
  quarantine="$diagnostic_root/wayland-quarantine"
  mkdir "$quarantine"
  : > "$quarantine/SHA256SUMS.txt"
  for library_name in "${wayland_libraries[@]}"; do
    copied_library="$host_appdir/usr/lib/$library_name"
    [[ -f $copied_library && ! -L $copied_library ]] || fail 'The copied Wayland library no longer matches the inspected layout.'
    [[ $(realpath -- "${copied_library%/*}") == "$host_appdir/usr/lib" ]] || fail 'The copied library directory resolves outside the experiment.'
    mv -- "$copied_library" "$quarantine/$library_name"
    (cd "$quarantine" && sha256sum -- "$library_name") >> "$quarantine/SHA256SUMS.txt"
  done
  printf '%s\n' 'Four Wayland libraries were moved ONLY from the experimental copy into wayland-quarantine; all are retained, and the control copy is intact.'
  printf '%s\n' 'Host candidates are not proof of actual loading. Review loader-evidence.txt per process after the test.'
  case_names=(gio-bundled-wayland gio-host-wayland)
fi

if [[ $launch_comparison == true ]]; then
  case_names=(mounted-clean extracted-clean)
  printf '%s\n' 'Launch comparison: same graphical session and starting directory, equivalent fresh temporary profiles, relay disabled, no software override.'
  printf '%s\n' 'Only the entry point changes: original AppImage runtime versus unchanged extracted AppRun. No bundled libraries are moved.'
  printf '%s\n' 'This is not a test of your regular profile, desktop shortcut or native Wayland. If both pass, the normal-launch failure remains unresolved.'
fi

summary="$diagnostic_root/summary.tsv"
printf 'case\texit_code\tgio_symbol_error\tegl_bad_parameter\tui_observation\n' > "$summary"
for case_name in "${case_names[@]}"; do
  require_no_statusline
  appdir=$original_appdir
  if [[ $case_name == gio-host-wayland ]]; then appdir=$host_appdir; fi
  bundled_modules="$appdir/usr/lib/x86_64-linux-gnu/gio/modules"
  case_directory="$diagnostic_root/$case_name"
  mkdir -p "$case_directory/config" "$case_directory/data" "$case_directory/cache"
  case_environment=(
    env -u GIO_MODULE_DIR -u GIO_EXTRA_MODULES -u GIO_USE_VFS
    -u LIBGL_ALWAYS_SOFTWARE -u GDK_BACKEND -u LD_DEBUG -u LD_DEBUG_OUTPUT
    -u LD_LIBRARY_PATH -u LD_PRELOAD -u WEBKIT_DISABLE_DMABUF_RENDERER
    -u WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS
    -u GST_PLUGIN_SYSTEM_PATH -u GST_PLUGIN_SYSTEM_PATH_1_0
    -u GST_REGISTRY -u GST_REGISTRY_1_0 -u APPDIR -u APPIMAGE
    -u APPIMAGE_EXTRACT_AND_RUN -u NO_CLEANUP
    "STATUSLINE_RELAY_BASE_URL="
    "STATUSLINE_DISABLE_UPDATES=1"
    "XDG_CONFIG_HOME=$case_directory/config"
    "XDG_DATA_HOME=$case_directory/data"
    "XDG_CACHE_HOME=$case_directory/cache"
    "GST_REGISTRY=$case_directory/cache/gstreamer-registry.bin"
    "GST_REGISTRY_1_0=$case_directory/cache/gstreamer-registry.bin"
  )
  # The upstream hook resets GIO_EXTRA_MODULES to the bundled directory, but leaves
  # GIO_MODULE_DIR alone. Set both to retain the bundled TLS module and exclude host GVFS.
  if [[ $case_name == gio-bundled-only* || $wayland_comparison == true ]]; then
    case_environment+=("GIO_MODULE_DIR=$bundled_modules" "GIO_EXTRA_MODULES=$bundled_modules")
  fi
  if [[ $case_name == *software ]]; then
    case_environment+=(LIBGL_ALWAYS_SOFTWARE=true)
  fi
  if [[ $trace == true ]]; then
    case_environment+=(LD_DEBUG=libs "LD_DEBUG_OUTPUT=$case_directory/loader")
  fi
  printf '\nCase: %s (%s seconds). Observe whether the UI renders and responds.\n' "$case_name" "$case_seconds"
  case_executable="$appdir/AppRun"
  if [[ $case_name == mounted-clean ]]; then case_executable=$appimage; fi
  # Both launch-comparison cases start in the same directory; only the entry
  # point changes. Their blank XDG profiles are separate to prevent carryover.
  # Never force extract-and-run for the mounted case or alter either AppRun.
  (
    cd "$appdir"
    exec setsid timeout --signal=TERM --kill-after=3s "${case_seconds}s" \
      "${case_environment[@]}" "$case_executable"
  ) > "$case_directory/startup.log" 2>&1 &
  active_pid=$!
  exit_code=0
  wait "$active_pid" || exit_code=$?
  stop_case

  error_logs=("$case_directory/startup.log")
  shopt -s nullglob
  for loader_log in "$case_directory"/loader.*; do error_logs+=("$loader_log"); done
  shopt -u nullglob
  if [[ ${#error_logs[@]} -gt 1 ]]; then
    # Keep per-PID filenames: initialization evidence is not the same as a "trying file" candidate.
    grep -H -E 'calling init:.*lib(wayland|EGL|gbm|GLX|glib|gio|gobject|gmodule|ffi)|initialize program:.*(WebKit|statusline)|symbol lookup error:' \
      "${error_logs[@]:1}" > "$case_directory/loader-evidence.txt" || true
  fi
  gio_error=no
  egl_error=no
  if grep -qE 'undefined symbol: g_task_set_static_name' "${error_logs[@]}"; then gio_error=yes; fi
  if grep -q 'EGL_BAD_PARAMETER' "${error_logs[@]}"; then egl_error=yes; fi
  observation=not-observed
  if [[ -t 0 ]]; then
    printf 'UI result [rendered / blank / no-window / not-observed]: '
    read -r observation || observation=not-observed
    case "$observation" in
      rendered|blank|no-window|not-observed) ;;
      *) observation=not-observed ;;
    esac
  fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$case_name" "$exit_code" "$gio_error" "$egl_error" "$observation" >> "$summary"
done

printf '\nResults (absence of an error or exit 124 does NOT prove successful rendering):\n'
cat "$summary"
printf '\nShare summary.tsv and the UI observations first. Keep raw logs, loader traces and screenshots private until reviewed.\n'
printf 'All diagnostic files, extracted libraries and temporary profiles remain in: %s\n' "$diagnostic_root"
printf '%s\n' 'No original artifact, system libraries, account settings or published release was replaced.'
