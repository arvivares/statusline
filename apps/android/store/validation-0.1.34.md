# Android internal quota-alert delivery — 0.1.34 (30)

Observed in authenticated Play Console on 2 October 2026. Account-holder-only
Internal testing is available and the physical Google Play installation and
synthetic quota-push transport were verified below. This is not an Alpha or
production publication, or proof of a real provider rollover.

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
  on that track. The physical Play installation was subsequently verified below.
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

## Physical Android QA — 2 October 2026

- After the operator unlocked the connected Samsung, ADB confirmed
  `versionName=0.1.34`, `versionCode=30`, installer `com.android.vending`.
  No GitHub APK sideload, uninstall or data reset was needed. The installed
  app retained its pairing, selected Antigravity focus and live Codex watchlist.
- UI baseline: Codex credit alerts **on**, new quota alerts **off**. Temporarily
  enabling quota preserved the credit opt-in and registered the new category.
- Using short-lived diagnostic channels, copied only the operator-approved
  encrypted routing registration; no FID decryption, credential extraction or
  user-channel/snapshot replacement was performed. Selection required exactly
  one newly opted-in quota registration with the credit preference unchanged.
- With Statusline in the background, the real Android Notification Manager and
  notification-drawer UI confirmed **Codex: quota available again** for the
  synthetic 5h recovery and **Codex: use your weekly quota** for the synthetic
  weekly warning. Both notification bodies were in English, matching the device.
- Repeated each exact event ID: the relay retained one completed event per case;
  no duplicate notification or update was observed. Android's automatic group
  summary is distinct from an extra feature-event delivery.
- Tapping the weekly notification opened Statusline and fetched real current
  readings. Detailed quota snapshots were never fabricated for the test.
- With quota turned off and credits kept on, a new synthetic recovery event was
  acknowledged without a new Android post or notification update. The channel
  no longer advertised quota-alert delivery. Also checked the reverse preference
  combination: credits off with quota on remained registered independently.
- Restored the original **credits on / quota off** preferences in UI and relay.
  The two original push registrations and their category totals were unchanged
  at completion. All three newly created diagnostic channels, registrations and
  deduplication-event rows were removed and absence verified. Existing user
  channels and published snapshots were not replaced or deleted.
- The installed widget provider remains bound. Rendering and independent refresh
  were not observed because its widget was not visible on the current home page;
  no new widget was added and no launcher layout was changed.

## Widget implementation follow-up

Subsequent inspection of the actual version-30 source found that
`StatuslineWidgetProvider.onUpdate()` projects `repository.cachedServices()`;
it does not fetch the relay. `updatePeriodMillis=1800000` triggers periodic
redrawing of that cache, not independent network synchronization. The current
manifest/application has no background relay worker, and the app's refresh
updates widgets after fetching in the foreground.

Consequently, do not claim independent Android widget synchronization for this
build. Rendering the existing widget is still useful QA, but cannot establish a
background fetch that this implementation does not perform. A background-sync
correction needs separate implementation, tests and a new Android build. The
operator approved that follow-up; source implementation and local tests are now
recorded in [the versionCode 31 candidate](validation-0.1.34-31.md). The installed
Play build 30 and the published GitHub installers have not been replaced by that
candidate. This limitation does not invalidate the physical push-delivery
observations above.

## Remaining gates

- Observe the existing widget rendering. Independent background fetch requires
  the implementation follow-up above, not merely waiting for this widget.
  Complete physical Spanish/fallback UI and notification QA if required by the
  release matrix; the physical notification observations cover English only.
- Observe a real provider exhaustion/recovery or last-hour weekly warning
  separately. Synthetic transport and server ACKs do not prove provider rollover,
  exact timing, delivery during device suspension or every agent's data source.
- Submit the corrected Data safety information and promote to Alpha only after
  policy and device gates pass. Do not create a new testing track/list or alter
  opted-in tester continuity as part of this upgrade.

Reference:
[Google's Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
