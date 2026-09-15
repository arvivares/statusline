# Android phone screenshots

The historical September 11 localized sets are in `en-US/` and `es-ES/`. Each contains four
unmodified screenshots of the real Android app, including its native launcher
widget. The four PNG files directly in this directory are the historical
September 2 set; do not reuse them for the localized listing. Both sets predate
Still Signature (0.1.18+). Preserve them as evidence, not as current-release
screenshots. The requested five-image Android set still requires current native
captures; iPhone artwork is not a substitute.

## Capture provenance

- Captured on September 11, 2026, on a physical Samsung Galaxy S8 (`SM-G950F`),
  reporting Android 16 and product `lineage_dreamlte`.
- Installed package: `inmerzion.statusline`, Google Play version `0.1.15`,
  `versionCode 11`, installer `com.android.vending`.
- The existing Play package was enabled in an isolated, temporary Android user.
  No APK replacement, app-data copy, Codex account or pairing token was needed.
- App content comes from the built-in **53% local demo**, visibly labeled as demo.
  The pairing field is empty. The widget displays the same local sample.
- Captured through ADB at an Android display override of **1080 × 1920**, density
  **420 dpi**. The app rendered at that size; the images were not stretched,
  cropped, composited, translated with an image editor or generated with AI.
- Android's System UI demo mode supplies the 09:02 clock and full battery.
  The phone's original display (1440 × 2960 at 480 dpi), English system locale,
  and disabled System UI demo settings were restored after capture. Android
  removed the ephemeral test user after switching back to the primary user.
- The system language, not a text overlay, was changed for each locale. The app,
  dates, pairing dialog and native widget were inspected in both languages.

These are captures of **0.1.15**, not a claim that 0.1.17 was installed or uploaded
to Play. Comparing Android source between `v0.1.15` and `v0.1.17` found no changes
to the app views, widget, demo, or the translations used by these screens. The
Android changes are version metadata and shared catalog entries for Companion.
That source comparison supports reusing the screenshots, but is not a runtime
test of bundle 13.

## Order and alternative text

Upload each set only to its corresponding Play listing language. Keep the order
below. No actual account status, credentials, pairing QR, personal notifications
or computer name is included.

| Order | Screen                 | English alternative text                                                                           | Spanish alternative text                                                                                        |
| ----- | ---------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1     | Weekly quota           | Codex weekly quota in local demo mode: 53% remaining, reset time and date.                         | Cuota semanal de Codex en modo demo local: 53 % disponible, hora y fecha de reinicio.                           |
| 2     | Local demo and privacy | Local demo and privacy controls, with encrypted-sync information and links to privacy and support. | Demo local y controles de privacidad, información sobre sincronización cifrada y enlaces de privacidad y ayuda. |
| 3     | Private pairing        | Pairing dialog with QR scanning and an empty field for a one-time private link.                    | Diálogo de vinculación con escaneo QR y un campo vacío para pegar el vínculo privado de un solo uso.            |
| 4     | Home-screen widget     | Android home-screen widget showing the 53% local demo, quota bar and reset time.                   | Widget de Android con la demo local del 53 %, barra de cuota y hora de reinicio.                                |

The filenames include the locale so they remain identifiable in Play's shared
asset library. Library upload alone does not replace a listing's screenshots or
publish changes; verify selection, order and saved draft separately. See the
[listing audit](../../listing-validation-2026-09-11.md) for submission status.
