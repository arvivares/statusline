# Android 0.1.28 — Alpha delivery

Recorded from the authenticated Play Console on **20 September 2026**.
The Alpha release is published and available to selected testers. This is not
confirmation of a Play-delivered physical-device upgrade or production release.

## Artifact verification

- Application ID: `inmerzion.statusline`.
- Version: `0.1.28`, version code `24`.
- Artifact: `Statusline_0.1.28_android.aab`, reused from the official release;
  no local rebuild or re-signing.
- SHA-256: `73bc4b4720a0551e32d3c9a5cca4bfdd5023186bb352bbb4cd8e1c3b81721f49`.
- Checksum matches the published release manifest.
- GitHub attestation verified against the repository's `release.yml` workflow.
- [Release](https://github.com/arvivares/statusline/releases/tag/v0.1.28).
- [Successful release workflow](https://github.com/arvivares/statusline/actions/runs/35502780720).

## Play Console receipt

- Previous Alpha release: `21 (0.1.25)`, available to selected testers.
- Submitted release: **`0.1.28-alpha.1`**, Closed testing — Alpha.
- Confirmed **Changes in review** after sending the single pending change.
  A subsequent check at 12:43 Europe/Madrid confirmed that automated quick checks
  had finished and the release was in review.
- A fresh portal check after the iOS submission confirms **App update published**
  and no unpublished changes. Alpha explicitly lists **0.1.28-alpha.1**, version
  code **24**, **Available to selected testers**, released on **20 September at
  12:48 Europe/Madrid**. Store propagation to individual devices can still vary.
- Full rollout: 100% of the existing Alpha audience; 177 countries/regions.
- Existing tester lists, countries, internal testing and production were unchanged.
- Managed publishing remains off; the approved update published to Alpha.
- English and Spanish release notes match `release-notes/0.1.28-*.txt`.
- No listing, screenshot, privacy or Data safety changes were submitted.
- Device support remains unchanged. Play accepted the embedded ReTrace mapping;
  its only warning is missing native debug symbols, a pre-existing diagnostic
  limitation that does not block this closed-track submission.

## Follow-up

1. Verify a Play-delivered upgrade, preserving pairing, readings, selected
   service and widget. This submission does not establish a new physical test.
2. Keep genuine tester enrollment uninterrupted; no production rollout is implied.

Existing eligible testers keep the same
[opt-in link](https://play.google.com/apps/testing/inmerzion.statusline).
