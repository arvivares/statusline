# iOS 1.0.3 (8) — App Review submission

Recorded 13 September 2026. The account holder requested the latest mobile
versions in their stores, then requested improved screenshots before completing
the iOS submission. Initially **Waiting for Review**; publication was verified
on **14 September 2026** as documented below.

## Publication verified — 14 September 2026

- Authenticated Distribution page: **1.0.3, Ready for Distribution**, build **8**.
- TestFlight: latest completed upload `1.0.3 (8)`; no later build observed.
- [Public Spanish storefront](https://apps.apple.com/es/app/statusline/id6807851320):
  version **1.0.3**, with the Still Signature release notes and widget-fix notice.
- No iOS runtime changes exist between the build's `v0.1.20` base and `v0.1.21`.
  The store build is not behind the latest desktop/Android release. The repository
  now records its version metadata; no binary was rebuilt or replaced.
- Read-only verification; no new device QA, release action or settings change.

## Source and validation

- Base source: `09e9814b560e8b12934085a12a18f0ddaf21efe8` (`v0.1.20`).
- Only app/widget version metadata differs in production source: `1.0.3 (8)`.
  Prepared in the isolated `chore/mobile-store-020` worktree; unrelated pending
  store edits in the original workspace were preserved.
- The latest live App Store version was independently verified as `1.0.2`,
  **Ready for Distribution**. TestFlight's previous highest build was 7.
- One Release archive, followed by local export and upload of the same archive;
  no repeated native compilation was needed. Xcode derived data was reused.
- The exported app and widget both report `1.0.3 (8)`, iPhone-only support,
  their existing bundle identifiers and the same nonempty production HTTPS relay.
- Strict distribution code-signature verification passed outside the sandbox.
  Inside the sandbox, the initial trust-chain lookup returned
  `CSSMERR_TP_NOT_TRUSTED`; no certificates or trust settings were changed.
- Both bundles retain the team, application identifiers and App Group;
  `get-task-allow=false`, `beta-reports-active=true`.
- Both archive and exported app/widget passed 529 compiled-message checks
  across English, Spanish and fallback, plus 16 language-resolution cases.
- All 23 relay bundle guard/configuration tests passed; project plist syntax,
  generated localization and whitespace checks passed.
- Exported IPA SHA-256:
  `5057e2d5cdd196f5f0fa11b85520501f2088511a2c360e07f4038573036fe854`.
  Upload may re-sign the same archive and need not retain that export hash.

## App Store Connect

- Xcode confirmed **Upload succeeded** on 13 September at 04:06 Europe/Madrid.
- App Store Connect later confirmed upload **Complete** for `1.0.3`, upload ID
  `221aa233-77f8-4018-8466-3d068196c795`.
- Created the `1.0.3` **Prepare for Submission** record. Inherited EN/ES
  descriptions, support/marketing URLs, names and other app information remain.
- Saved [Spanish](release-notes/1.0.3-es-ES.txt) and
  [English](release-notes/1.0.3-en-US.txt) release notes, 683 and 614 characters.
- Saved the [updated review notes](release-notes/1.0.3-review.txt), 3,767 characters.
  They describe all five screenshots per language and state honestly that the
  physical-device recording predates the new design. No new physical test of
  build 8 is claimed.
- Reattached the original 52-second physical-iPhone review recording to this
  version; it was not inherited. The attachment and notes were verified after
  reloading the saved page. The private video is not stored in the repository.
- Selected build **8 / 1.0.3**, saved immediately and reloaded the version page
  to verify the persisted association. The final submission also confirms
  **1.0.3 (8)**.
- Uploaded five Still Focus screenshots to each of **English (U.S.)** and
  **Spanish (Spain)** in the **6.9-inch** display class. Removed only the single
  obsolete overview from each locale in this draft version; historical source
  files and the previously published version were preserved.
- Verified the order in both locales: quota, reset/sample age, pairing, widget,
  privacy/local control. Corrected the English upload-completion ordering and
  checked it again after navigation. The 6.5-inch class uses the corresponding
  localized 6.9-inch set. A transient fallback label after Add for Review was
  checked in Media Manager: English has its own five English images, with
  distinct stored image URLs from Spanish; no additional upload was needed.
- Read back the localized descriptions, release notes and support/marketing
  URLs. No territory, price, account, external-beta or release-policy change.
- Apple confirmed **1 Item Submitted**, then **Waiting for Review** for
  **iOS App 1.0.3 / 1.0.3 (8)** on **13 September 2026 at 18:33 Europe/Madrid**.
  Submission ID: `eeb6164f-505c-4c07-aac3-20e84b4d9662`.
- Release remains automatic after approval, available to all users immediately
  rather than phased over seven days. Existing ratings are retained. Submission
  is not approval or confirmation that the new version is publicly available.

## Screenshot provenance and validation

The account holder selected **Still Focus** and requested **five images per
store, per language**. The ten submitted iOS PNGs are stored in
`assets/still-focus/{en-US,es-ES}/`: quota, reset/sample age, pairing, Home Screen
widget, and privacy/local control. The reusable gallery and export template are
in `scripts/store-artwork/` at the repository root.

Native sources were captured on the dedicated unpaired iPhone 17 Pro simulator
(iOS 26.3.1), using public local-demo controls and the actual medium widget.
No live pairing credential or personal quota was used. Source captures remain
unretouched; artwork adds explanatory copy, proportional framing and explicit
detail crops. The English widget sample is older than the Spanish sample;
both are actual local examples and show their real sample-age indicators.

The initial native app capture run passed three tests without skips. Subsequent
widget setup/capture runs provided the verified English and Spanish Home Screen
images. Intermediate widget-selector experiments failed and were replaced with
the observed page-2 gesture; they are not product QA failures or proof of an
update-cadence guarantee. The capture harness was then simplified to avoid
automatically adding duplicate widgets. Visual inspection remains required.

All ten exports were visually reviewed in both languages and checked for the
1320 × 2868 size, opaque RGB, complete PNG chunks, exactly five files per locale,
loaded native assets and no headline/visual overlap. The manual Codex protocol
example remains English in the Spanish app, as it does in the real product.

App Store Connect's session expired during artwork preparation. After the
account holder signed in again, the screenshots, attachment and build selection
were saved and the complete item was submitted. The PNG validator was rerun
successfully for all ten files before the final submission. Build 8 was also
observed in TestFlight as Ready to Submit with Internal QA assigned; this is not
confirmation of a new physical-device test.

At submission time, the next action was to monitor App Review. The later
publication check above completes that step; no further submission is pending.
The Android five-image set remains a separate task requiring native Android
captures; the iPhone artwork must not be substituted for it.
