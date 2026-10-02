# Android quota-alert staging — 0.1.34 (30)

Observed in authenticated Play Console on 2 October 2026. This is a staging
record, not a claim of tester availability or production publication.

## Artifact and saved draft

- Downloaded the signed AAB/APK from GitHub Latest
  [v0.1.34](https://github.com/arvivares/statusline/releases/tag/v0.1.34).
  Their hashes match the release checksum file; GitHub attestation verification
  of the AAB passed against `arvivares/statusline`.
- AAB SHA-256:
  `1a34d046324938720afe5be57b07afec2b4c3a6c6638c590db38d23a72143fa5`.
- APK SHA-256:
  `5643d986743721040a3ee05cdcbebcf9a21d9734669e56f5c0ecd34157c44d25`.
- Play accepted bundle **30 (0.1.34)**, minimum API 23 and target SDK 36, in a
  new Internal testing draft named
  `0.1.34-internal.1 - Quota notifications`.
- Saved the draft with [English](release-notes/0.1.34-en-US.txt) and
  [Spanish](release-notes/0.1.34-es-ES.txt) release notes. Play confirmed
  "Changes saved". The previous versionCode 27 is excluded from that draft.
- **No rollout was confirmed.** Existing Internal testing still serves
  `0.1.31-internal.1 - Codex reset alerts`; Closed testing Alpha still serves
  `0.1.28-alpha.1`. Tester lists, country settings and access links were unchanged.
- Production access is still under Google's review; the dashboard says the
  application for production access is being reviewed. This is different from
  review/approval of any particular app build.

## Data safety staging

- Added **App functionality** to collected **App interactions** and **Device or
  other IDs**, covering quota-alert events and the installation identifier used
  for requested push delivery. Preserved the existing ML Kit **Analytics** purpose.
- Both types remain optional, non-ephemeral and not shared; existing diagnostic
  and performance disclosures were not removed. The preview confirms those
  purposes, encrypted transport and the existing deletion/privacy URLs.
- Saved these changes using the form's draft action. Play says
  "Change saved. Send for review in Publishing overview." No policy review was
  sent and no approved/public Data safety update is claimed.
- The existing relay privacy URL redirects to the website, whose deployed policy
  still lacks Firebase/quota-alert information. Publish the updated site from
  main and verify the public policy before submitting/distributing the candidate.
  No website deployment was performed by this staging operation.

## Remaining gates

- ADB sees no connected Android. No app was installed, pairing altered or new
  notification preference enabled during this staging operation.
- Validate an upgrade from the user's existing installation, independent category
  preferences, widgets, English/Spanish and real background notification delivery.
  If the installed app comes from Play App Signing, use a Google Play update;
  do not uninstall it to bypass a signing-key mismatch with the GitHub APK.
- Use an isolated diagnostic registration for synthetic push checks, without
  replacing live quota snapshots. Confirm event deduplication and category
  opt-out before rolling out to the existing Internal/Alpha audiences.
- Submit the corrected Data safety information and release only after policy and
  device gates pass. Do not create a new testing track/list or alter opted-in
  tester continuity as part of this upgrade.

Reference:
[Google's Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
