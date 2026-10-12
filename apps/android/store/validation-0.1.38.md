# Android 0.1.38 (35) delivery attempt — 12 October 2026

## Authorized build-36 correction

After the upload rejection below, the account holder authorized minimum Android 7
(API 24) while preserving Play automatic protection. A separate reviewed change
raises minSdk and Android version code to **36**, retaining versionName **0.1.38**,
target SDK 36, existing dependencies, upload certificate, package and relay pairing.
The old v0.1.38 tag/assets remain immutable. Build-36 signing, upload acceptance
and rollout must be recorded separately; none is inferred from the failed build 35.

Prepared [English](release-notes/0.1.38-36-en-US.txt) and
[Spanish](release-notes/0.1.38-36-es-ES.txt) notes explicitly disclose the new minimum.

## Artifact provenance and verification

- Source: reviewed main `25fa6fd0e421afef541a9f2e9a34cad8828a4859`, signed tag
  `v0.1.38`, successful [Release workflow 38241325112](https://github.com/arvivares/statusline/actions/runs/38241325112).
- Downloaded the exact `statusline-0.1.38-android-release-attempt-1` CI artifact,
  ID `11742294744`, and verified both files against `ANDROID-SHA256SUMS.txt`.
  No rebuild, modification or repackaging was performed.
- AAB SHA-256: `3182458ad4c8e2fa63ef27783611fd3cc9467c2a3fbbaa779f784bc9b64ce83b`.
- APK SHA-256: `e7c8e6561a886f4a7d5b6b5a2ec9ee45d21c83e6dd8a2c1e5fc7b96a8a75a019`.
- `jarsigner -verify` reports **jar verified**. The existing Android upload
  certificate matches SHA-256
  `A78E0DAE32F86302D57DD75F137D20ADBEDE2AF703EC28CF26A96B2B68E4156C`.
  JDK 26 also reports the expected self-signed trust-chain/no-timestamp warnings
  and a manifest-order JarFile/JarInputStream consistency warning. These are not
  presented as a warning-free verification or proof of Play acceptance.
- CI tests, lint and signed APK/AAB generation passed. No phone installation or
  new physical-device QA was requested or performed in this delivery attempt.

## Play upload blocker

Uploaded the unmodified AAB in a new Internal release. Play Console rejects it
with: **Play automatic protection requires a minimum SDK version of 24 or
higher. The uploaded App Bundle has a minimum SDK version of 23.**

The [official automatic-protection requirements](https://support.google.com/googleplay/android-developer/answer/10183279?hl=en-GB)
also specify minimum API 24. This is separate from target SDK, Firebase BoM
compatibility, app signing and the production-access testing requirement.

No protection was disabled and minSdk remains 23. The account holder must choose
between a new API-24-or-later build, dropping Android 6, or disabling only Play's
automatic protection to retain API 23. Do not silently weaken security, override
manifest checks, replace the published v0.1.38 assets or claim this upload passed.

Saved `0.1.38-internal.1 - Quota alerts` as a **draft**, with EN/ES notes but no
accepted app bundle. After resolving the blocker, reuse the accepted candidate in
both Internal and Closed Alpha and confirm 100% rollout to eligible testers.

## Existing access preserved

- Closed Alpha remains active: **0.1.28-alpha.1**, version code **24**, available
  to selected testers; **178** existing countries/regions were observed.
- Its `Statusline Alpha` list (**18 emails**) and `Statusline Internal` list both
  remain selected. An email entry is not proof that the user opted in.
- Internal remains active: **0.1.34-internal.2 - Background widgets**, code **31**,
  available to existing internal testers.
- Production remains unavailable after Google's 3 October testing assessment.
  The dashboard shows **11 opted-in testers**. No production access application,
  tester-list mutation, region change, device sideload or pairing change occurred.
- Existing [opt-in link](https://play.google.com/apps/testing/inmerzion.statusline)
  is unchanged. This record does not assert that 0.1.38 can be downloaded from it.

## Privacy and Data safety

- The live Data safety preview confirms optional, collected/not shared **App
  interactions** and **Device or other IDs**, with **App functionality +
  Analytics** purposes. Diagnostics and other app-performance data retain their
  existing optional Analytics declarations; encryption in transit and no account
  creation were preserved.
- Corrected the older relay-hosted deletion and privacy links to the live official
  `https://statusline.inmerzion.io/delete-data` and
  `https://statusline.inmerzion.io/privacy`. The official privacy policy includes
  Firebase and minimal quota-alert metadata with an effective date of 2 October.
- Saved and sent exactly **two** changes, **Privacy policy** and **Data safety**,
  for review. Publishing overview confirms **Changes in review**, with automated
  checks running. This is not approval or a new Alpha/Internal binary rollout.
- Localized release notes explicitly mention optional quota alerts, background
  widget refresh and push when OpenAI adds new Codex reset credits. They do not
  advertise Claude Code in this mobile binary.
