# Android widget follow-up — 0.1.34 (31) candidate

The operator approved a background-widget correction after build 30 QA exposed
its cache-only limitation. This follow-up is available only in account-holder
Internal testing; [public GitHub build 30](validation-0.1.34.md) is unchanged.

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

## Signed CI artifact — 3 October 2026

- All PR checks passed for code commit `c11d642dd8e4f2a043bfd851367171f995adec56`;
  GitHub confirms its SSH signature is valid for `arvivares`.
- Account-holder-only Android artifact workflow
  [run 37070437261](https://github.com/arvivares/statusline/actions/runs/37070437261)
  passed tests/Lint/debug and signed release APK/AAB. Downloaded that exact
  artifact and its separate R8 mapping without recompiling a release locally.
- Checksums verified against `ANDROID-SHA256SUMS.txt`. APK:
  `e3ff394f7ed9987ed852898e615ca1cdb68a99588876500001fea925b0f61141`.
  AAB:
  `83783118def862530616e4f555ba1d9d52efd1f3a5954ffbdc48b672decdb298`.
- `apksigner verify` passed v1/v2 with the existing upload certificate SHA-256
  `a78e0dae32f86302d57dd75f137d20adbede2af703ec28cf26a96b2b68e4156c`.
  Package metadata confirms `inmerzion.statusline`, versionCode **31**,
  versionName `0.1.34`, minimum API 23 and target SDK 36.
- This workflow artifact has **no GitHub SLSA attestation**: the attestation step
  belongs to the tagged public release finalizer, not this branch artifact build.
  The verification lookup returned 404; it is not presented as an attestation pass.
  Public GitHub release assets were not replaced.

## Account-holder Internal delivery — 3 October 2026

- Verified the Internal track selects only the existing `Statusline Internal`
  list, containing the account holder. `Statusline Alpha` (16 testers) remains
  unchecked there. No email list, access link or region was changed.
- Uploaded the exact verified CI AAB. Google recognized **31 (0.1.34)**,
  minimum API 23, target SDK 36 and the automatically attached ReTrace mapping.
  Build 30 was excluded from the new release; supported-device counts did not
  decrease. Preview had zero blocking errors and one existing native-debug-symbol
  warning, not a missing Java/R8 mapping warning.
- Published **0.1.34-internal.2 - Background widgets**. Play confirms
  **Available to internal testers**, released **3 October 00:24 Europe/Madrid**,
  with version code **31**. EN/ES release notes are saved. This is not an Alpha or
  production rollout, and no public GitHub asset/tag was overwritten.

## Remaining device and broader distribution gates

No physical version-31 installation is claimed here yet. The operator reconnected
the Samsung after Internal publication; ADB confirms its current Play installation
is still build **30**, with notification permission granted. Preserve the install and its pairing;
do not sideload a differently signed APK or reset app data to bypass validation.

Validate an in-place Play upgrade, unchanged pairing/focus/notification preferences, independent redraw with
the app inactive, one persistent job across process death/reboot, offline cache,
no network after removing the last widget, and safe disconnect/re-pair races.
Do not force-stop to simulate normal backgrounding: Android suspends background
work after force-stop until the app is opened again. Broader rollout still requires
the public privacy-policy/device gates in the build-30 record.
