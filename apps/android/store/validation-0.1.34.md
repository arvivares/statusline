# Android internal quota-alert delivery — 0.1.34 (30)

Observed in authenticated Play Console on 2 October 2026. Account-holder-only
Internal testing is available; this is not an Alpha or production publication,
nor proof of installation or push delivery on the physical phone.

## Artifact and internal publication

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
- Confirmed **Save and publish** for Internal testing. The track is **Active**,
  shows this release as **Latest** and **Available to internal testers**, and
  records release time **20:54 Europe/Madrid**. This replaces versionCode 27 only
  on that track; availability in the device's Play Store still needs checking.
- Verified Internal testing selects only the existing account-holder email list;
  the 16-user Alpha list is not selected on Internal. No list, email, country
  or opt-in link was changed. Closed testing Alpha remains `0.1.28-alpha.1`.
- Preview showed zero blocking errors and one informational warning for missing
  native debug symbols. ReTrace mapping is attached; third-party native symbols
  were not invented. The supported-device counts are unchanged.
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
  main and verify the public policy before Data safety review or distribution
  beyond account-holder QA. The operator confirmed they will handle deployment;
  no website deployment was performed by this delivery operation.

## Remaining gates

- ADB now sees the Samsung, but it is locked. The installed app remains
  `0.1.31 (27)`, installed by `com.android.vending`. No version-30 installation,
  pairing change or new notification preference is claimed during preparation.
- Validate an upgrade from the user's existing installation, independent category
  preferences, widgets, English/Spanish and real background notification delivery.
  If the installed app comes from Play App Signing, use a Google Play update;
  do not uninstall it to bypass a signing-key mismatch with the GitHub APK.
- Use an isolated diagnostic registration for synthetic push checks, without
  replacing live quota snapshots. Confirm event deduplication and category
  opt-out before distribution beyond the account-holder internal test.
- Submit the corrected Data safety information and promote to Alpha only after
  policy and device gates pass. Do not create a new testing track/list or alter
  opted-in tester continuity as part of this upgrade.

Reference:
[Google's Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
