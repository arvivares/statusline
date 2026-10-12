# Android 0.1.38 (36) — Play protection compatibility hotfix

## Authorized change and source

The account holder approved minimum **Android 7/API 24** to preserve Google Play
automatic protection. [PR #105](https://github.com/arvivares/statusline/pull/105)
passed its fresh required checks and merged into reviewed, verified main commit
`1bad720fe62af66a43b00481c216a15b0718ba65` on 12 October 2026.

VersionName remains **0.1.38** and versionCode increases to **36**. Target SDK 36,
package `inmerzion.statusline`, tested dependencies, upload certificate, relay
credentials, existing pairing and opt-in preferences remain unchanged. Android 6
does not receive new builds. No device installation or fresh physical QA of the
protected build is claimed; CI and store acceptance do not establish push delivery.

## CI and artifact verification

- Manual [Android workflow 38249921846](https://github.com/arvivares/statusline/actions/runs/38249921846)
  uses the exact reviewed main commit above. Attempt 1 failed downloading the
  Gradle distribution with **HTTP 504**, not an app compiler/test error. Retried
  only the failed signing job; **attempt 2 completed successfully** with test/Lint,
  Release APK/AAB, packaged-manifest, alignment, R8 and signature gates.
- An earlier dispatch `38249841134` resolved before the merge at the old commit
  and was cancelled by workflow concurrency. No artifact from that run is used.
- Artifact: `statusline-0.1.38-android-release-attempt-2`, ID **11747038818**,
  non-expired, source head matching `1bad720`. ZIP digest:
  `sha256:3f9c7b9770e983673e4784659e2aedc3a43bd1666b51b138896ef84185eb2b67`.
- Downloaded that exact artifact, without rebuilding/repacking. Both files pass
  the workflow's `ANDROID-SHA256SUMS.txt` verification.
- AAB SHA-256: `1fbb7de05b8cb37e75894efdcbf99c23bd14efb9de120cf1fd882c11660c61c7`.
- APK SHA-256: `e928d92769e45bd967a596e049ff1c1b0af912ec0f82935d4f6da99f83a86b5f`.
- Local `jarsigner -verify` reports **jar verified**. Existing upload certificate
  SHA-256 matches `A78E0DAE32F86302D57DD75F137D20ADBEDE2AF703EC28CF26A96B2B68E4156C`.
  JDK 26 reports self-signed-chain/no-timestamp/POSIX and manifest-order
  JarFile/JarInputStream warnings; this is not a warning-free verification.
- Local release checks passed **319 tests**, one existing skip, TypeScript,
  localization, metadata, formatting and documentation links. The 21 focused Node
  policy/toolchain/website tests passed. A broader local glob also tried the
  unchanged brand test, which could not load absent `@resvg/resvg-js` in this
  isolated worktree; fresh repository CI passed with its installed dependencies.
- No GitHub tag or public release asset is replaced. Public v0.1.38 remains the
  historical **build 35**. This Play build's provenance is the manual workflow and
  reviewed main above, not the old tag. Desktop and iOS are not rebuilt.

## Store preparation

- Internal draft notes were updated in EN/ES and verified after saving. They
  disclose Android 7 minimum, independent quota/reset-credit alerts and
  best-effort background widgets. No unsupported Claude mobile integration is
  advertised.
- The release editor explicitly shows **Automatic protection is on** and
  **Releases are signed by Google Play**. No protection setting was changed.
- The earlier failed build-35 upload reference was removed from the current
  editor before uploading the verified code-36 candidate. Record actual accepted
  bundle and rollout receipts below, not inferred availability.

## Internal release — 12 October 2026

- Play accepted **36 (0.1.38)** with **24+** API levels and target SDK **36**.
  The bundle is marked Enhanced with its ReTrace mapping attached.
- Preview reports two non-blocking warnings: **1,165 device models** no longer
  supported versus the previous release, and absent third-party native debug
  symbols. The compatibility reduction is the authorized Android-7 minimum;
  symbol coverage remains an operational diagnostic follow-up.
- Confirmed publication of **`0.1.38-internal.1 - Android 7 + quota alerts`**.
  Internal testing is active and explicitly reports **Available to internal
  testers**, released at **14:47 Europe/Madrid**. This is portal availability,
  not proof every phone has refreshed its Google Play cache or installed it.
- Promoted that exact accepted version code into an existing **Closed Alpha**
  draft without uploading another bundle or selecting Production. Reapplied
  both EN/ES release notes because the promotion editor initially copied only
  one language.

## Closed Alpha submission — 12 October 2026

- Saved **`0.1.38-alpha.1 - Android 7 + quota alerts`** with the same code-36
  artifact and submitted exactly one change at **14:50 Europe/Madrid**.
- Publishing overview confirms **Changes in review**, **Closed testing - Alpha**
  and **Start full rollout**. Managed publishing remains off, so the update is
  configured for all existing eligible testers after approval; no production
  rollout or tester-list/country mutation was requested.
- Automated checks are still running. This is not Alpha approval or proof that
  its testers can download code 36 yet. The old Alpha remains the serving version
  until approval/rollout; Internal already reports the new release available.
- The privacy/Data safety changes sent separately earlier on 12 October are now
  published: overview shows the updated publication date and no pending privacy
  changes; the earlier notifications confirm publication. This is distinct from
  the new binary's Alpha review.
- Existing [tester opt-in link](https://play.google.com/apps/testing/inmerzion.statusline)
  remains unchanged. Testers must use their eligible Google account and opt in;
  list membership alone does not guarantee enrollment or instant propagation.
- Reopened Alpha after submission: the track is active, explicitly **In review**
  for the new release, with **178 countries/regions** unchanged. Testers still
  select **Statusline Alpha (18 emails)** and **Statusline Internal**; both row
  checkboxes and Select all are checked, with Save disabled. No email list was
  edited. The prior 0.1.28 release remains Available to selected testers while
  code 36 awaits approval.
