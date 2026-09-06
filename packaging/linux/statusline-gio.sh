#!/usr/bin/env bash

# Sourced by AppRun after the upstream GTK hook, before loading the executable.
# Keep bundled GIO and its TLS module together; do not load the host's GVFS ABI.
# Deliberately scoped to this AppImage process and its children, not the system.
statusline_appdir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
statusline_gio_modules="$statusline_appdir/usr/lib/x86_64-linux-gnu/gio/modules"
if [[ ! -f "$statusline_gio_modules/libgiognutls.so" ]]; then
  printf '%s\n' 'Statusline AppImage is missing its bundled GIO TLS module.' >&2
  exit 1
fi
export GIO_MODULE_DIR="$statusline_gio_modules"
export GIO_EXTRA_MODULES="$statusline_gio_modules"
unset statusline_gio_modules statusline_appdir
