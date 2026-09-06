# iOS release validation

This file records reproducible readiness evidence without storing credentials or personal account data. The 2–3 September evidence applies to `1.0 (2)`; the separate 6 September sections track the localized `1.0 (3)` and unified-brand `1.0 (4)` TestFlight candidates.

## Passed — builds 1 and 2, 2–3 September 2026

- iPhone-only Release Archive created for `inmerzion.statusline` with widget `inmerzion.statusline.widget`.
- App and widget display name: `Statusline`; development language: Spanish.
- Local App Store export signed by Apple Distribution for team `F3HRL896HJ`.
- App Store provisioning profiles have `get-task-allow=false` and `beta-reports-active=true`.
- App icon is a 1024 × 1024 PNG without alpha and uses the same Data Plane artwork, geometry and palette as Android.
- Three accepted 1284 × 2778 RGB screenshots without alpha are uploaded from the 1320 × 2868 source captures.
- Privacy, Support and Data Deletion URLs return public HTML successfully.
- Eleven unit tests passed on a physical iPhone 17 Pro; local-demo, scanner-fallback and manual-editor UI coverage passed across physical iPhone and simulator.
- TestFlight build `1` installed and launched on the physical iPhone. Real QR pairing, app/widget synchronization and persistence after closing and reopening the app passed physical QA on 3 September.
- The app offers a local 70% demo and manual `/status` entry, so review does not require a login, Codex account, desktop Companion or live pairing credential.
- Privacy disclosure conservatively reports relay metadata as Other Data Types, used only for app functionality, not linked and not tracked.
- App Store Connect record `6807851320` exists for iOS version `1.0`, with the Spanish product-page metadata and three screenshots saved.
- The published privacy label reports **Data Not Linked to You → Other Data**, used for App Functionality and not used for tracking.
- Apple's current questionnaire calculated a 4+ age rating; content rights are declared as no third-party content.
- Build `1` uploaded successfully, completed processing as Validated and supplied the physically tested binary.
- Icon-only build `2` was archived once after static and `actool` validation, exported with Apple Distribution, verified on disk, uploaded successfully and processed as **Valid** and **App Store Eligible**. App Store Connect recognized the new Data Plane icon and build `2` is attached to version `1.0`.
- Build `2` was installed and confirmed operational on the physical iPhone on 3 September.
- Price is Free, distribution is Public, availability covers all 175 countries or regions, and Mac and Vision Pro compatibility distribution are disabled for the iPhone-only release.
- Internal TestFlight group `Internal QA` has automatic distribution enabled and one account-holder tester. Build `2` reports its internal state as **In Beta Testing**.
- External TestFlight group `External Beta` has one tester and build `1` assigned. The build was submitted to Beta App Review and is currently **Waiting for Review**.
- TestFlight Spanish description, feedback address, marketing URL, privacy URL, review contact and per-build What to Test instructions are saved.
- The App Store version's no-login answer, private review contact and prepared review notes are saved. The private phone number and tester identity are intentionally not versioned.
- The account holder declared **Non-trader under the DSA**; App Store Connect reports the declaration as **Active** for all 27 EU countries or regions and all current regulatory requirements complete.
- On 3 September, the stale internal enrollment was reset by removing its redundant individual-build assignment and re-adding the account holder to `Internal QA`. App Store Connect immediately changed the internal tester from **No Builds Available** to **Invited**.
- The external tester remains unavailable while build `1` is in Beta App Review; no external invitation or TestFlight install is claimed yet.
- Version `1.0` (`2`) was submitted to App Review on 3 September 2026. Submission `82a8811b-67a9-48b4-bd43-1cff4b741f7f` is **Waiting for Review** and the release mode is manual.

## App Review correction — 6 September 2026

- Apple's 5 September response lists one new rejection reason: Guideline 5,
  concerning China mainland availability and references to OpenAI in metadata.
- Removed China mainland through App Store Connect's availability selector. The
  persisted country table reports **China mainland — Not Available**; a comparison
  of all 175 country rows confirmed that this is the only changed territory.
- The other 174 storefronts, including Hong Kong and Macau, remain **Available on
  App Release**. Free pricing, public distribution and the selected `1.0 (2)` build
  are unchanged.
- Saved updated review notes in App Store Connect, preserving the existing video
  and all six review-information sections while correcting regional availability.
  Reloaded the version page and verified that the stored 3,567-character notes match
  the prepared text exactly. Their source is maintained in `app-review.md`.
- On 6 September, selected **Update Review** for version `1.0` and verified that
  the existing `1.0 (2)` item became **Ready for Review**. Then confirmed **Resubmit
  to App Review**. Submission `82a8811b-67a9-48b4-bd43-1cff4b741f7f` and its app-version
  item both report **Waiting for Review**; App Store Connect shows 6 September as
  the new submission date.
- The correction is included in the saved Review Notes; no separate Resolution
  Center message was sent. No binary compilation or upload was needed. Approval
  and the subsequent manual release remain pending.

## Localization candidate — 6 September 2026

- Prepared `1.0 (3)` from the `v0.1.11` localization source, updating the iPhone
  and widget Debug/Release build numbers together with `release.json`. Desktop and
  Android version numbers remain unchanged.
- Before archiving, the localization checker passed for all 403 EN/ES messages,
  562 source references, placeholders and seven generated files. Release preflight
  and property-list validation passed too.
- Reused the existing derived-data directory and created one Release archive for
  iPhone. Both packaged bundles report version `1.0`, build `3`, minimum iOS 17,
  device family `1` and development language `en`. The app retains the HTTPS relay
  origin, shared Data Plane icon and localized EN/ES camera permission descriptions.
- Validated both the archive and the exported IPA with the compiled-bundle
  localization checker: 403 messages in English, Spanish and French fallback,
  plus 16 locale-resolution cases, passed for the app and widget separately.
- Exported using Cloud Managed Apple Distribution for team `F3HRL896HJ`.
  Signature verification passed; both distribution profiles have
  `get-task-allow=false` and `beta-reports-active=true`, and both signed bundles
  retain `group.inmerzion.statusline`.
- The locally exported IPA has SHA-256
  `70acb8e7f363d514ff98f2ca567d7bbfce0f31ac72632978a65b2932d2e6b98f`.
  Xcode's explicit upload export reused the same archive without recompiling;
  re-signing during that upload need not preserve the local IPA checksum.
- Xcode reported **Upload succeeded** on 6 September. App Store Connect completed
  processing the new `1.0 (3)` upload, created at 2:44 AM in the console's displayed
  time zone. Build Metadata reports **Validated**, localizations **English, Spanish**,
  device family **iPhone**, symbols included and no non-exempt encryption.
- Confirmed `Internal QA` has automatic Xcode-build distribution enabled, one
  installed tester, and Apple Silicon Mac/Vision Pro testing disabled.
- The `Internal QA` Builds tab now lists `1.0 (3)` as **Testing**, expiring in
  90 days. The global build list's **Ready to Submit** status concerns external
  beta submission; it does not block this verified internal availability.
- Saved the 968-character Spanish What to Test instructions from
  `testflight/what-to-test-es-ES.txt` on build `3` and verified them after reloading.
  The English equivalent is versioned in `testflight/what-to-test-en-US.txt` for a
  future English TestFlight metadata localization. No external group was added.
- The existing builds `1` and `2` now both show **Testing** in TestFlight and are
  assigned to `Internal QA` and `External Beta`; the earlier pending Beta App Review
  entry above is historical, not the current state.
- The account holder explicitly chose to test build `3` internally first. The
  waiting App Store submission remains `1.0 (2)`; its build, Review Notes,
  availability and manual-release setting were not changed for this upload.
- New physical-device QA for build `3` is pending. The compiled-bundle checks are
  not a claim that the app was launched or the full XCTest suite executed on a
  physical device during this upload. EN/ES test instructions are in `testflight/`.

## Unified-brand candidate — 6 September 2026

- Built `1.0 (4)` from signed preparation commit
  `26219fe2e67c577cf3652b2bb2a6716b0be3eb78`. Protected-branch PR `16` merged
  the identical tree as `377b3ab4eef5a6e898252868341382e0e6b1e1a1`, the target
  of the GitHub-verified signed tag `v0.1.12`.
- Release checks passed before archiving: 57 desktop tests, TypeScript,
  formatting, 189 local Markdown links and all 403 EN/ES messages. The Xcode
  project passed property-list validation; PR CI also passed Android tests/lint.
- Reused Xcode derived data and produced one iPhone Release archive, then
  exported and uploaded that same archive without recompiling. App and widget
  report `1.0 (4)`; the app retains the production HTTPS relay origin, iPhone-only
  device family, minimum iOS 17 and the unified icon.
- Both archived and exported bundles passed 403 compiled-message checks in
  English, Spanish and French fallback, plus all 16 locale-resolution cases.
- Exported with Apple Distribution for team `F3HRL896HJ`. Signature verification
  passed outside the filesystem sandbox. Both signed bundles retain the App Group,
  `get-task-allow=false` and `beta-reports-active=true`.
- Local exported IPA SHA-256:
  `6da77f4e5110ed3d70f92b9a45fc4cb848299f289956b45607150c0c047198ff`.
  Upload export may re-sign the package and need not retain that local checksum.
- Xcode reported **Upload succeeded**. App Store Connect completed processing
  and reports **Validated**, build `4`, **English, Spanish**, **iPhone**, symbols
  included and no non-exempt encryption. The console records the upload on
  6 September at approximately 5:15–5:16 AM in its displayed time zone.
- Saved the 1,180-character Spanish What to Test instructions and verified the
  persisted text after reloading. The English equivalent remains versioned for
  a future English TestFlight metadata localization.
- Confirmed `Internal QA` has four builds and lists `1.0 (4)` as **Testing**,
  expiring in 90 days, with one installed account-holder tester. The global
  **Ready to Submit** label refers to external beta review, not internal access.
- No external group was added to build `4`, and no App Review submission,
  review notes, availability, pricing or release-mode setting was changed.
- Physical-device QA for build `4` remains pending; archive validation and
  TestFlight processing do not establish runtime or widget correctness.

## Remaining follow-ups

- Install `1.0 (4)` through TestFlight on the physical iPhone and validate the new
  icon, English, Spanish, unsupported-language fallback, the widget and preservation
  of pairing.
- After that QA, obtain explicit authorization before replacing the queued
  `1.0 (2)` App Store submission or distributing build `4` externally. Refresh
  reviewer notes and localized listing assets when selecting the localized build.
- Wait for App Review's decision on the corrected `1.0 (2)` submission sent on
  6 September unless its replacement is subsequently authorized.
- After approval, make the explicit manual-release decision in App Store Connect.
