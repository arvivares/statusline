# Android 0.1.21 — Alpha availability verified

Recorded from the authenticated Play Console on **14 September 2026**. This is
a dated observation, not a live status feed or a physical-device QA result.

## Artifact and release

- Application ID: `inmerzion.statusline`.
- Version: `0.1.21`, version code `17`.
- Official AAB: `Statusline_0.1.21_android.aab`, 14,962,386 bytes.
- SHA-256: `cd86c5336e44c7920222c4bba2a3a2bb6574a5939a829f85903148548f708d62`.
- Source: `774070737fb8a412f143e9a272ba0b1de6899597`.
- [Published release](https://github.com/arvivares/statusline/releases/tag/v0.1.21).
- [Release workflow](https://github.com/arvivares/statusline/actions/runs/34823898997).
- The official release AAB was reused without local compilation or re-signing.
  Play accepted the bundle with its embedded ReTrace mapping. The existing
  native-debug-symbol warning remains distinct from Java/Kotlin deobfuscation.
- Closed testing — Alpha showed **0.1.21-alpha.1, Available to selected testers**.
  Full rollout targets the existing 177 countries/regions. Internal testing
  remains **0.1.9 (5) · QR scanner fix**. No production rollout is claimed.

## Closed-test enrollment

- Alpha selects the `Statusline Alpha` and `Statusline Internal` email lists.
  Internal testing selects only `Statusline Internal`. Tester identities are
  deliberately excluded from this public record.
- The dashboard marks both a published closed-testing release and **at least
  12 testers opted into the closed test** as complete.
- The **14 consecutive days** criterion remains incomplete; the production
  application button was disabled. No exact completion date was displayed.
- List membership is permission to join, not proof of track enrollment or an
  installation. An opted-in internal tester must leave that program before
  joining Alpha. Testers already in Alpha should not leave/rejoin, because that
  interrupts their continuous enrollment. See
  [Google's testing guidance](https://support.google.com/googleplay/android-developer/answer/9845334)
  and [production-access requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

Eligible testers use the same
[Alpha opt-in link](https://play.google.com/apps/testing/inmerzion.statusline)
and [Play listing](https://play.google.com/store/apps/details?id=inmerzion.statusline).

## Remaining verification

- Complete genuine closed testing and collect feedback while maintaining the
  required enrollment; production access requires a separate application.
- Verify a Play-delivered update on an eligible device, including version code,
  pairing preservation, sync, widget and language behavior. Store availability
  does not establish that each tester has installed the release.
- Finish and verify the five-image-per-language native Android store set.
  This availability check did not upload screenshots or publish listing drafts.
