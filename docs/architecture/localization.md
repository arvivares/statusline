# Application localization

Statusline follows the **primary system language** on desktop, iPhone and Android,
including native widgets, accessibility labels, dates, errors and the desktop tray.
There is no account-level or synced language preference.

| Primary system language                           | Statusline language |
| ------------------------------------------------- | ------------------- |
| Spanish (`es`, `es-ES`, `es-MX`, `es-419`, etc.)  | Spanish             |
| English (`en`, `en-US`, `en-GB`, etc.)            | English             |
| Any other language, missing language or POSIX `C` | English             |

Only the first language is considered. For example, French followed by Spanish in
the system's preferred-language list still selects English. UI layout remains
left-to-right for the two supported languages. Operating-system-owned dialogs
and external websites may follow their own language settings.

## Sources and implementation

[`localization/messages.json`](../../localization/messages.json) is the canonical
English-to-Spanish catalog. English messages are stable source keys; `{0}`, `{1}`,
etc. are positional arguments. Keep complete sentences together and do not build
translated sentences by concatenating fragments. Argument replacement is a single
pass, so user or server data cannot become a second template.

- Desktop TypeScript reads the catalog directly. Static HTML uses `data-i18n`
  attributes and is English before initialization; dynamic rendering uses `t()`.
  Native Rust obtains the OS language through
  [sys-locale](https://docs.rs/sys-locale/0.3.2/sys_locale/) and uses the same catalog
  for tray labels/tooltips. Foreground/language events refresh the window language.
- Apple uses generated `en.lproj` / `es.lproj` string tables shared by the app,
  WidgetKit extension and SwiftUI macOS companion. `L10n` explicitly selects the
  table and formatting locale; the project's development language is English.
  Camera permission descriptions have localized `InfoPlist.strings` files.
- Android uses a generated Kotlin catalog for Compose and error-message keys,
  plus native XML resources for widget previews and metadata. The application
  reads the first OS locale, independently of Android's secondary-language resource
  fallback. Activities normalize their resource context. Widgets explicitly bind
  translated labels and refresh on locale/configuration changes.

Names such as Statusline, Codex, ChatGPT, Keychain and technical identifiers such
as AES-256-GCM, HTTPS and CLI commands are not translated. Protocol keys, QR links,
credentials, timestamps and cached samples never depend on the UI language. The
manual `/status` parser still accepts Codex's original English `Weekly limit`,
`% left` and `resets` syntax in either UI language.

Errors are translated from structured error codes at the presentation boundary;
raw relay/OS messages are not shown as translated application copy. Persistent
feedback in Android is stored as a source key and translated when rendered.

## Editing translations

1. Edit the canonical catalog; use concise labels that fit the Data Plane design.
2. Add `t("English source")` / `L10n.text("English source")` at the UI boundary.
3. Run the generator from the repository root and commit its outputs:

   ```shell
   node scripts/generate-localizations.mjs
   node scripts/generate-localizations.mjs --check
   npm --prefix apps/desktop run localization:check
   ```

Generated files are checked in so Xcode, Gradle and installer builds do not require
running a separate translation service. Never edit a generated file directly.
The quality pipeline checks catalog placeholders, source keys and stale outputs.

## Validation

Run the desktop language/copy tests, Android `L10nTest`, and Apple
`LocalizationTests`. Keep protocol tests running: language changes must not affect
encryption, pairing, parsing or storage. Native Rust tests cover primary-language
resolution too.

On macOS, `scripts/check-apple-localization.swift` can also be compiled alongside
`apps/apple/Shared/L10n.swift`. Pass the built `.app` (or widget `.appex`) path and
repository root to verify every compiled string in English, Spanish and French
fallback without installing an app or starting a simulator.

For account-free desktop previews:

```text
http://127.0.0.1:1420/?preview=ready&lang=en
http://127.0.0.1:1420/?preview=ready&lang=es
http://127.0.0.1:1420/?preview=error&lang=fr-FR&panel=source
```

The `lang` parameter only affects local preview mode, never the packaged app.
Review at the real 400 × 600 desktop size. Before release, also check iPhone and
Android physically in English, Spanish and an unsupported primary language:

- Empty, local-demo, paired, syncing, timeout, expired-QR and disconnected states.
- Scanner permission granted/denied, manual link entry and secure-storage errors.
- Widget picker, compact/small/medium widgets, reset date and accessibility text.
- Long Spanish labels, large system text and a language change followed by app
  reopening and widget refresh. Do not change or remove pairing data during this test.

The reference images in the README and store submission kits are separate release
assets; refresh them when preparing the next localized store submission.
