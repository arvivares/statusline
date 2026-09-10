#!/bin/sh
# Read-only validation of the actual processed plists, not source placeholders.
# Used by Xcode after embedding the widget and on exported distribution bundles.
set -eu

fail() {
    printf 'error: Statusline relay validation: %s\n' "$1" >&2
    exit 1
}

[ "$#" -ge 2 ] && [ "$#" -le 3 ] || fail 'Expected app Info.plist, widget Info.plist and optional configuration.'
app_plist=$1
widget_plist=$2
configuration=${3:-Release}

read_value() {
    /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || fail "Missing $2 in $3."
}

validate_origin() {
    # Reject empty/unexpanded values, credentials, paths, queries and fragments.
    # A custom HTTPS origin is supported; loopback HTTP is Debug-only.
    if ! printf '%s\n' "$1" | /usr/bin/awk -v configuration="$configuration" '
        BEGIN { valid = 0 }
        NR == 1 && /^https:\/\/([[:alnum:]][[:alnum:].-]*|\[[0-9A-Fa-f:]+\])(:[0-9]+)?\/?$/ { valid = 1 }
        NR == 1 && configuration == "Debug" && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?\/?$/ { valid = 1 }
        END { exit !(valid && NR == 1) }
    '; then
        fail "$2 relay endpoint is empty or invalid. Set STATUSLINE_RELAY_BASE_URL at PROJECT level for all targets."
    fi
}

[ -f "$app_plist" ] || fail 'App Info.plist was not found.'
[ -f "$widget_plist" ] || fail 'Embedded widget Info.plist was not found.'
app_origin=$(read_value "$app_plist" StatuslineRelayBaseURL app)
widget_origin=$(read_value "$widget_plist" StatuslineRelayBaseURL widget)
validate_origin "$app_origin" App
validate_origin "$widget_origin" Widget
[ "${app_origin%/}" = "${widget_origin%/}" ] || fail 'App and widget relay endpoints differ.'

for key in CFBundleShortVersionString CFBundleVersion; do
    app_version=$(read_value "$app_plist" "$key" app)
    widget_version=$(read_value "$widget_plist" "$key" widget)
    [ -n "$app_version" ] && [ "$app_version" = "$widget_version" ] || fail "App and widget $key must be nonempty and equal."
done

printf '%s\n' 'Statusline relay validation passed: app and embedded widget have matching endpoints and versions.'
