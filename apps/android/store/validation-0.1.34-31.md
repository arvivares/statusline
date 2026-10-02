# Android widget follow-up — 0.1.34 (31) candidate

The operator approved a background-widget correction after build 30 QA exposed
its cache-only limitation. This record describes source/local validation, not a
published replacement for [Play/GitHub build 30](validation-0.1.34.md).

## Implemented and verified locally — 2 October 2026

- Added a unique WorkManager task, nominally every 30 minutes with a connected
  network, only while a widget exists, pairing is valid and demo is off. Multiple
  widgets/callbacks reuse `KEEP`; removal/disconnect/demo cancel the task.
- Reuses the current Keystore reader and existing encrypted relay contract. No
  credential/FID is saved in job input/output, no notification choice changes,
  and no server migration, relay deployment or re-pairing is required.
- Added a shared response-revision guard and atomic cache compare/write. Replies
  from before disconnect/re-pair/demo cannot restore the previous reading;
  overlapping foreground/background responses cannot rewind the sequence.
- Existing cache is preserved on errors; only network/timeout/rate failures get
  bounded retries. WorkManager `2.11.2` preserves API 23 support; `2.12.0` would
  raise the minimum to API 24 and is intentionally not selected.
- Incremented Android versionCode to **31**, keeping versionName `0.1.34`, and
  aligned `release.json`. The already published `v0.1.34` assets remain build 30;
  no existing release/tag/installer was overwritten.
- `:app:testDebugUnitTest`, `:app:lintDebug` and `:app:assembleDebug` passed:
  **36 tests, zero skips/failures/errors**, including eight new worker/cache-race
  tests. The new Kotlin sources compile without warnings. Gradle's existing
  Gradle-10 deprecation summary remains; it is not a test failure.
- Release preflight passed. Documentation records cadence, force-stop/Doze limits
  and approximately 48 snapshot requests/day per active installation before
  foreground refreshes/retries. [Focused security review](../../../docs/security/android-widget/THREAT-MODEL.md)
  documents the response-race fix and remaining device gates.
- Prepared localized internal notes:
  [English](release-notes/0.1.34-31-en-US.txt),
  [Spanish](release-notes/0.1.34-31-es-ES.txt).

## Remaining delivery and device gates

No signed APK/AAB, Play upload/publication or physical version-31 installation is
claimed here. ADB currently has no connected Android while the operator's USB
iPhone is being tested. Preserve the current Google Play install and its pairing;
do not sideload a differently signed APK or reset app data to bypass validation.

Build the signed CI artifact after review, then validate an in-place Play internal
upgrade, unchanged pairing/focus/notification preferences, independent redraw with
the app inactive, one persistent job across process death/reboot, offline cache,
no network after removing the last widget, and safe disconnect/re-pair races.
Do not force-stop to simulate normal backgrounding: Android suspends background
work after force-stop until the app is opened again. Broader rollout still requires
the public privacy-policy/device gates in the build-30 record.
