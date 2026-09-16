# Android 0.1.17 — Play submission evidence

Recorded on 11 September 2026 from the official release artifact, repository
source and authenticated Google Play Console. At 13:06 UTC, Publishing overview
showed **Changes in review**, with automated checks still running. This is not
confirmation of approval or download availability.

## Artifact and scope

| Field               | Verified value                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Application ID      | `inmerzion.statusline`                                                                     |
| Version name / code | `0.1.17` / `13`                                                                            |
| Artifact            | `Statusline_0.1.17_android.aab`                                                            |
| Size                | 14,937,447 bytes                                                                           |
| SHA-256             | `c3b99a344f14963531dc232487a087ad43a3601550eb0d57725b2560c331079b`                         |
| Release             | [v0.1.17](https://github.com/arvivares/statusline/releases/tag/v0.1.17)                    |
| Source commit       | `974de512a5d5a8f7ad997b0ac4a772514df30001`                                                 |
| Build workflow      | [34587925488, attempt 1](https://github.com/arvivares/statusline/actions/runs/34587925488) |
| Play release name   | `0.1.17-alpha.1`                                                                           |
| Track / rollout     | Closed testing — Alpha / 100% of eligible testers after approval                           |

- Downloaded the published AAB without rebuilding or re-signing it.
- Its local SHA-256 and byte count matched the release manifest, checksum file
  and GitHub release asset metadata.
- `gh attestation verify` succeeded for `arvivares/statusline`; its verified
  provenance identifies the source commit and release workflow above.
- Google Play accepted `13 (0.1.17)`, API 23+, target SDK 36, with its ReTrace
  mapping file attached.
- Compared with `0.1.15`, Android app-source changes are the version identifiers
  and generated shared message catalog. The Android manifest, dependencies,
  pairing implementation and widget refresh behavior are unchanged. Companion
  update notifications require installing Companion 0.1.17 separately; they are
  not an Android in-app updater feature.

## Submission verification

- The previous available Alpha release was `0.1.15-alpha.1`, bundle 11.
- The new release includes only bundle 13 and supersedes bundle 11 on Alpha.
- Play's compatibility comparison showed zero devices newly supported or no
  longer supported in every form factor. Phone support remains 13,333 models
  and tablet support remains 6,841 models.
- One non-blocking warning remains: native debug symbols have not been uploaded.
  The attached ReTrace mapping file does not resolve that native-code warning.
- Entered and verified [English](release-notes/0.1.17-en-US.txt) and
  [Spanish](release-notes/0.1.17-es-ES.txt) notes, 286 and 330 characters respectively.
- Verified the rollout percentage as `100.0` before saving.
- Publishing overview contained exactly one change:
  **Closed testing — Alpha / 0.1.17-alpha.1 / Start full rollout**.
- Confirmed **Send changes for review**. The console then showed **Changes in
  review** and stated that the change proceeds to review once quick checks pass.
  Its initial estimate of up to 14 minutes refers to those checks, not approval.
- Managed publishing remains off. Successful review is therefore configured to
  make the release available automatically; no production rollout was requested.
- The existing 177-country targeting and selected `Statusline Alpha` and
  `Statusline Internal` lists were preserved. No tester, policy, internal-testing
  or production setting was edited.
- The localized descriptions and eight screenshots remain separate saved
  listing drafts. They were not part of the single submitted change.

## Tester access and remaining checks

The access audit immediately before this submission found seven addresses in
`Statusline Alpha` and one owner address in `Statusline Internal`. Both lists
are selected for the Alpha track; only the internal list is selected for the
internal-testing track, whose available release remains `0.1.9 (5)`.
List membership does not establish opt-in or installation, and internal-test
enrollment prevents receiving the closed track until the tester leaves the
internal test and opts into Alpha. See
[Google's testing guidance](https://support.google.com/googleplay/android-developer/answer/9845334).

1. Confirm that Google completes checks/review and Alpha shows **Available to
   selected testers** before announcing that bundle 13 can be downloaded.
2. Eligible testers continue using the same
   [Alpha opt-in link](https://play.google.com/apps/testing/inmerzion.statusline)
   and [Play listing](https://play.google.com/store/apps/details?id=inmerzion.statusline).
3. Validate the actual Play update on an enrolled physical device: version code
   13, preserved pairing, quota sync, English/Spanish UI and home-screen widget.
   This submission did not install bundle 13 on the connected phone. Do not
   sideload the GitHub APK over a Play installation to simulate this update.
4. Submit the separate listing refresh when authorized and investigate native
   debug-symbol availability before production.
