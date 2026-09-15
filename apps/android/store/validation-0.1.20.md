# Android 0.1.20 — Google Play submission

Recorded 13 September 2026. Google Play confirmed **Changes in review** for
`0.1.20-alpha.1`, Closed testing — Alpha. This is submission evidence, not
approval or confirmation that an installed phone can download the update.

## Verified artifact

- Application ID: `inmerzion.statusline`.
- Version: `0.1.20`, version code `16`.
- Published AAB: `Statusline_0.1.20_android.aab`, 14,960,818 bytes.
- SHA-256: `3514a9b8a104c596a3fc13683a687f9da9490074921ddda90f2f39a09ce7db7a`.
- Source: `09e9814b560e8b12934085a12a18f0ddaf21efe8`.
- [Release workflow, attempt 1](https://github.com/arvivares/statusline/actions/runs/34730890091).
- Downloaded the official release artifact without rebuilding or re-signing;
  its byte count and hash matched the published manifest. GitHub attestation
  verification returned success.
- Google accepted `16 (0.1.20)`, API 23+, target SDK 36, with a ReTrace mapping
  file attached. One existing non-blocking native-debug-symbol warning remains.
- No device models were newly excluded or added relative to bundle 13.

## Scope and result

- Previous available Alpha version: `0.1.17-alpha.1`, bundle 13.
- New release contains bundle 16 only; 100% rollout to eligible Alpha testers.
- Existing 177-country selection and both selected tester lists were preserved.
- Saved and verified [English](release-notes/0.1.20-en-US.txt) and
  [Spanish](release-notes/0.1.20-es-ES.txt) notes.
- Publishing overview contained exactly one change: Closed testing — Alpha /
  `0.1.20-alpha.1` / Start full rollout. Confirmed **Send changes for review**;
  the console subsequently showed **Changes in review** with quick checks running.
- Managed publishing remains off: approval is configured to make the Alpha
  update available automatically. Production and internal testing were not changed.
- No screenshots or older listing drafts were included in this submission.
  The account holder subsequently requested improved screenshots. A separate
  current-build Android capture is pending device access; ADB showed no device.
  Still Focus is now approved, with exactly five images per language (EN/ES).
  Neither USB nor previously paired wireless-debugging discovery found a device.
  iOS artwork is complete but must never be substituted for Android screenshots.

## Remaining

Confirm approval and actual Play delivery, including upgrade/pairing/widget QA
on an eligible physical device. Complete the five-image localized screenshot
sets after native capture; do not label older Data Plane captures as the current
Still Signature UI. The selected composition is documented in
`scripts/store-artwork/README.md`; Android-specific rendering remains pending.

Eligible testers keep the same
[opt-in link](https://play.google.com/apps/testing/inmerzion.statusline).
