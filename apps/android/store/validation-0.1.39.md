# Android 0.1.39 (37) — Claude mobile delivery

## Artifact verification — 13 October 2026

- Exact AAB downloaded from the immutable
  [v0.1.39 release](https://github.com/arvivares/statusline/releases/tag/v0.1.39),
  source `94de6586c974c0d86a6e923ce9240396c43a7033`, reviewed
  [PR #107](https://github.com/arvivares/statusline/pull/107).
- Artifact `Statusline_0.1.39_android.aab`, size **15,658,093 bytes**, SHA-256
  `6f94b223156f5a5fa7e6af577316431d9adca410fad9e3fc3aebd329307c9381`.
  The digest matches both the published asset and release checksums. No rebuild,
  repacking, tag move or asset replacement was performed.
- Upload signature verifies with the existing certificate, SHA-256
  `A78E0DAE32F86302D57DD75F137D20ADBEDE2AF703EC28CF26A96B2B68E4156C`.
  Existing self-signed-chain/no-timestamp and manifest-order warnings are retained;
  verification is not claimed to be warning-free.
- Play accepted **37 (0.1.39)**, package `inmerzion.statusline`, API **24+**,
  target SDK **36**, Enhanced bundle with ReTrace mapping. Automatic protection
  and Google Play signing remain enabled. No device-model compatibility was lost
  relative to accepted build 36.
- Preview reports one non-blocking warning: third-party native debug symbols
  are missing. No fake symbols were uploaded or protection setting disabled.
- Prior local QA passed 42 Android unit tests, release Lint, shared provider
  fixtures, packaged-app guards and localization. This is not a fresh physical
  device/widget/push delivery pass.

## Internal and Closed Alpha

- **`0.1.39-internal.1 - Claude Code`** explicitly reports **Available to
  internal testers**, released **13 October at 08:34 Europe/Madrid**.
- Promoted that exact accepted code-37 bundle to Closed Alpha without another
  upload. Saved both English and Spanish release notes; promotion initially
  carried only one language, which was corrected before saving.
- Submitted only **one binary change** at **15:01 Europe/Madrid**:
  **`0.1.39-alpha.1 - Claude Code`**, **Start full rollout**, 100% after approval.
  Publishing overview confirms **Changes in review**; automated quick checks
  were still running at verification. The Alpha track separately confirms
  **In review**, active, with **178 countries/regions** unchanged.
- Managed publishing remains off. **0.1.38-alpha.1** remains Available to
  selected testers until code 37 is approved and rolled out. No production
  access application, production rollout or open test was requested.
- Verified unchanged selected lists: **Statusline Alpha (18 entries)** and
  **Statusline Internal**, both checked, with Save disabled. No email addresses
  or list membership were edited.
- The [tester opt-in link](https://play.google.com/apps/testing/inmerzion.statusline)
  remains unchanged. Eligible testers must use their allowed Google account and
  opt in; list membership or submission alone does not prove installation.

## Listing draft deliberately not submitted

Complete EN/ES text is saved from `listing/`, describing all three supported
mobile services and the separate optional quota/reset-credit notifications.
The existing asset draft contains four English Data Plane captures uploaded on
11 September, rather than the current Still Signature mobile interface.
Visual inspection confirmed the mismatch. No old capture was replaced, deleted
or presented as a new Claude screenshot.

Used **Save for later** on the Store listings group before sending the Alpha
binary change. Afterwards, Publishing overview still lists the four metadata
changes as **not submitted**: add Spanish, English short/full description and
English phone screenshots. The texts and pre-existing asset draft are preserved.
Replace the outdated captures with current native Android EN/ES imagery before
sending this group. This does not block the separate Alpha binary review.

No phone installation, pairing change, notification preference change or relay
deployment occurred during this delivery.
