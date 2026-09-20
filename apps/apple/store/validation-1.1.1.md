# iOS 1.1.1 (10) — delivery validation

Recorded on **20 September 2026**. Uploaded successfully at **12:48 Europe/Madrid**;
processing completed and Internal QA shows **Testing**. Submitted to App Review
at **13:13 Europe/Madrid**; the version is **Waiting for Review**.

## Source and intended change

- Base: `v0.1.28`, source `a9504722e52d11e3682b0dc94dbb636035d03ee0`.
- App and widget: `1.1.1 (10)`, bundle `inmerzion.statusline`.
- Removes manual `/status` quota entry; keeps QR/pairing-link setup, local demo,
  existing pairing, Codex/Gemini selection and widgets.
- English/Spanish release notes, What to Test and review instructions are
  prepared in this release kit.
- Published version remains **1.1.0 (9), Ready for Distribution**. The separate
  **1.1.1 (10)** submission contains the updated EN/ES text and review notes.

## Environment diagnosis

- Host: macOS `27.0` (`26A428`); installed Xcode `26.3` (`17C529`).
- Apple's [compatibility table](https://developer.apple.com/support/xcode/)
  limits Xcode 26.3 to macOS 15.6–26.x; Xcode 27 supports this host.
- Xcode 26.3's code signature verifies, but its GUI launch fails with `-10664`.
- First-launch components were installed successfully. Downloaded iOS 26.2
  simulator runtime `23C52` verifies and boots, but the installed SDK is `23C57`.
  A direct target build fails in asset catalog compilation with no matching
  simulator runtime. Scheme destinations remain ineligible.
- No app-code failure has been established by these environment errors.
- The account holder approved installing **stable Xcode 27 alongside 26.3**.
  Xcode **27.0 (27A266a)** was downloaded from Apple's authenticated developer
  downloads, expanded, verified with `codesign` and accepted by Gatekeeper
  (`source=Apple System`). It is installed separately at
  `~/Applications/Xcode-27.app`; `/Applications/Xcode.app` remains version 26.3.
- The account holder accepted Xcode 27's license; first-launch checks pass.
  The matching iOS 27.0 runtime (`24A434`) is installed. Global `xcode-select`
  remains unchanged; build commands use the new app's `DEVELOPER_DIR`.

## Build and package verification

- Release archive and App Store export succeeded with automatic signing.
- App and widget carry `1.1.1 (10)` and matching nonempty HTTPS relay endpoints.
  `validate-relay-bundle.sh` passed for both archive and exported IPA.
- Exported distribution signature verifies; `get-task-allow` is false.
- Exported IPA SHA-256:
  `dc47eaecfb1c25aac25cf7be2e19abd9dfd18f51a1723750c546a123a14709e6`.
- Uploaded the same archive through `ExportOptions-Upload.plist` without a new
  build. Xcode reported **Upload succeeded / Uploaded package is processing**.
  Portal upload ID: `ec4e1a10-5710-4dee-909a-eedf48bf73dd`.

## Native and static tests

- Unit suite: 39 passing test definitions (72 parameterized executions reported
  per device), with the opt-in artwork fixture skipped during normal regression.
  The first run's UI runner failed to initialize accessibility on the new
  simulator; this was not a successful overall test run.
- Final independent unit rerun `UnitValidated.xcresult`: **Passed**, 39 passing
  definitions / 72 executions, zero failures and only the intentional fixture
  skip, after removing the opt-in marker.
- A retry reached the UI cases. Demo and pairing fallback passed; two assertions
  incorrectly searched for legal links as buttons, and the Spanish support
  assertion used `Soporte` instead of the shipping `Ayuda`. Only the test selectors
  were corrected, including the capture test's legal-link selector.
- Final `SimulatorValidatedViews.xcresult`: **6 passed, 0 failed, 0 skipped**:
  EN/ES removal checks, demo, QR/private-link fallback, and both localized capture
  flows. No production behavior was altered to make tests pass.
- `ArtworkSeed.xcresult`: guarded synthetic fixture passed on the dedicated
  unpaired simulator. Marker removed afterward; never applied to the real phone.
- All 23 relay-bundle regression checks pass; release preflight and
  `git diff --check` pass.

## Physical-device upgrade

- User authorized installing the development-signed Release archive app over
  **1.1.0 (9)** on their iPhone 17 Pro. Device metadata confirms **1.1.1 (10)**.
- Existing pairing, readings and services remain present. The app opened and
  confirmed a newly updated encrypted snapshot from the relay.
- The existing medium Home Screen widget renders Codex and Gemini, matches the
  app's readings and displays sample age/reset information. No uninstall, pairing
  reset, demo loading or account change was performed.
- These are USB-installed Release checks, not a TestFlight-distributed upgrade.
  A later independent background widget fetch has not yet been established by
  this check: increasing sample age alone is not evidence of a network refresh.
  The existing widget policy requests 30-minute refreshes, with iOS controlling
  actual scheduling. No five-minute guarantee is claimed.
- Personal-device screenshots are private diagnostics outside the repository;
  unrelated captures were discarded and are not used as review/store assets.

## Artwork and metadata

- [Five images per locale](assets/1.1.1/README.md), with eight freshly captured
  native app sources and two explicitly reused, unchanged WidgetKit captures.
- All ten final exports were visually reviewed. Image/count/format/field-limit
  validation passes. Capture provenance distinguishes simulator fixtures from
  physical-device QA and the shipping Codex-only local demo.
- English and Spanish descriptions, promotional text and What's New were saved
  in the 1.1.1 draft and verified after changing locale/reloading.
- Five screenshots per locale were uploaded, reordered where necessary and
  verified after reloading Media Manager. Final portal thumbnails were visually
  checked in both languages, including the matching 6.5-inch inherited set.
- TestFlight's app-level description still referred to manual `/status` entry
  and the old relay privacy URL. Replaced it with the versioned EN/ES beta
  descriptions, official website/privacy links and current review instructions.
  Contact details, sign-in requirements, invitation settings and tester lists
  were not changed.
- Build-specific What to Test was saved in Spanish and English. The existing
  **Internal QA** group lists **1.1.1 (10), Testing**; this is internal availability,
  not external Beta App Review approval or a confirmed TestFlight installation.

## App Review receipt

- Final confirmation: **1 Item Submitted**, followed by **Waiting for Review**.
- Item: **iOS App 1.1.1**, build **1.1.1 (10)**.
- Submitted: **20 September 2026, 13:13 Europe/Madrid**.
- Submission ID: `3d22359f-693c-478e-b0ed-e4535cd7db2a`.
- [Submission in App Store Connect](https://appstoreconnect.apple.com/apps/6807851320/distribution/reviewsubmissions/details/3d22359f-693c-478e-b0ed-e4535cd7db2a).
- Preserved free pricing, iPhone-only support and existing territories, including
  the China mainland exclusion. Release remains automatic after approval, to all
  users immediately; existing ratings are retained.

## Follow-up

1. Monitor Apple's decision; submission is not approval or public availability.
2. Verify a TestFlight/App Store-delivered upgrade independently from USB QA.
3. Confirm a later independent background widget fetch; do not infer it from
   correct rendering or increasing sample age alone.

No certificate was revoked, pairing reset or published Apple version replaced.
