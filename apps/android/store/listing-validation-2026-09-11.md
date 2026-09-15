# Google Play listing audit — 11 September 2026

This is a point-in-time record from the authenticated Play Console and repository
source, not a claim that a new Android build or listing has been published.

## Distribution observed before the listing refresh

| Surface                         | Version                                | Observed state                                                                            |
| ------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Closed testing — Alpha          | `0.1.15-alpha.1`, bundle `11 (0.1.15)` | Available to selected testers; full rollout; 177 countries/regions; released 10 September |
| Internal testing                | `0.1.9 (5) · QR scanner fix`           | Available to internal testers; full rollout                                               |
| Latest app bundle in Play       | `11 (0.1.15)`                          | Uploaded 10 September; active                                                             |
| Latest GitHub Android artifacts | `0.1.17 (13)`                          | Published APK/AAB; absent from the inspected Play inventory                               |

Before editing the listing, Publishing overview showed the last publication on
10 September, with no pending changes displayed and managed publishing off.
The selected Alpha tester lists were `Statusline Alpha` and `Statusline Internal`.
No tester list, country, rollout or publishing setting was changed.

## Description changes

The previous default listing was live and showed a last-updated date of
1 September. Its language selector contained only `en-US`; the Spanish text
present in the repository had not been added as a Play listing localization.

- Updated the English short and full descriptions from [en-US.md](listing/en-US.md).
- Added Spanish (Spain), `es-ES`, from [es-ES.md](listing/es-ES.md).
- Kept `Statusline` as the app name and English as the default language.
- Checked the complete field contents against the local Markdown before saving.
- Used **Save as draft** and observed **Your changes have been saved**.
- Did not proceed to review or send changes for review. This is not a live
  listing update and does not distribute bundle 13.

| Locale  | App name           | Short description | Full description |
| ------- | ------------------ | ----------------- | ---------------- |
| `en-US` | 10 / 30 characters | 74 / 80           | 2303 / 4000      |
| `es-ES` | 10 / 30 characters | 68 / 80           | 2490 / 4000      |

The new copy is specific to Android: a resizable home-screen widget, compatible
launcher caveat for the 4 × 1 default, local demo, optional pairing and explicit
desktop requirements. It describes the widget's cached data accurately: open and
refresh the app to fetch a newer snapshot. It does not advertise continuous
telemetry, a guaranteed background-refresh interval, increased Codex allowances
or support for other agents.

## Initial screenshot findings

The four files directly in `assets/phone/` are historical Android captures, not a verified
localized set for the current build:

- `01-weekly-limit.png`, `02-private-demo.png` and `03-private-pairing.png` mix
  Spanish prose with English labels and buttons.
- `04-home-widget.png` is English and includes unrelated launcher apps, a music
  widget and a Google Play icon. It should be replaced by a focused, clean Android
  home-screen capture using clearly labeled demo data.
- At the initial audit, these images were inspected but not changed.
- Play Console initially showed four phone screenshots matching the historical set.
  The first asset's detail panel identified `01-weekly-limit.png`, 1080 × 1920,
  dated 2 September 2026.
- Initially no Android device was connected through ADB and no local emulator/AVD
  was available. The later Wi-Fi connection resolved the capture blocker.

## Physical-device capture completed

With explicit permission, an ephemeral Android user was created for screenshots.
The existing Google Play package was enabled for that user with `install-existing`;
no APK, account data or pairing credentials were copied or replaced.

- Physical device: Samsung Galaxy S8, `SM-G950F`, Android 16,
  product `lineage_dreamlte`.
- Capture build: Google Play `0.1.15 (11)`, not GitHub `0.1.17 (13)`.
- Source comparison between the two tags found no changes to the shown Android
  views, widget, demo, or their translations. New shared catalog entries concern
  Companion. This is not a runtime validation of bundle 13.
- Eight actual Android screenshots were captured: four each in
  `assets/phone/en-US/` and `assets/phone/es-ES/`, at 1080 × 1920.
- Each set shows the 53% local demo, privacy/demo controls, empty QR/manual
  pairing dialog, and the native home-screen widget. All images were inspected.
- No image-generation, compositing, stretching or translated image overlays were
  used. The device rendered each screen in the selected system language.
- The original display (1440 × 2960, 480 dpi), `en-US` locale and disabled System
  UI demo settings were restored. Android removed the ephemeral user after
  returning to user 0. The original package remained installed at versionCode 11.
- The original account was not disconnected, re-paired, uninstalled or cleared.

See [capture provenance, order and alternative text](assets/phone/README.md).

## Screenshot draft saved in Play Console

- Uploaded and selected the four `es-ES` images for the Spanish listing. This
  replaced its inherited historical set with explicitly localized assets.
- Uploaded the four `en-US` images for the English listing and removed the four
  historical images from that listing. Their original files remain in the
  repository and Play asset library; no original library asset was deleted.
- Both locales contain **4 / 8** phone screenshots, ordered as quota, local
  demo/privacy, private pairing, and home-screen widget.
- Used **Save as draft** and observed **Your changes have been saved**, **Draft
  saved**, and disabled Save/Discard controls. Switching back to Spanish after
  saving English confirmed its independent image set was retained.
- Visually inspected both saved galleries. The asset details report 1080 × 1920,
  9:16 and an upload date of September 11, 2026; no cropping was applied.
- The app icon, feature graphic, descriptions, tester lists and releases were not
  changed during the screenshot update. The localized description drafts from
  the earlier step remain in place.
- No **Next**, submission, review or publication action was taken. This is a
  complete saved listing draft, not a live store update or a new Alpha build.
- Alternative text is prepared locally; the inspected asset details panel did
  not expose an editable alt-text field.

## Subsequent Alpha submission

Later on 11 September, the user authorized publishing `0.1.17 (13)` to Alpha.
The verified official AAB was uploaded and submitted as `0.1.17-alpha.1`, with
English/Spanish release notes and 100% rollout after approval. At 13:06 UTC,
Play Console showed **Changes in review**, with automated checks still running.
Only the release was submitted; the description and screenshot drafts above
were not included. See [bundle 13 submission evidence](validation-0.1.17.md).

## Remaining work

1. Review the complete listing diff and submit the saved descriptions and
   screenshots when authorized. Verify any final asset declarations before
   submission; these phone screenshots were not generated or edited with AI.
2. Confirm that the submitted `0.1.17 (13)` passes Google's checks and review
   and becomes available to selected Alpha testers. Do not equate submission
   with download availability.
3. After submission and approval, verify the actual Play update path and listing
   on an enrolled physical device. GitHub publication is not Play availability.

Official guidance:
[listing fields and limits](https://support.google.com/googleplay/android-developer/answer/9859152)
and [preview assets](https://support.google.com/googleplay/android-developer/answer/9866151).
