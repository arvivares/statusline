# iOS release validation

Validated 2–3 September 2026 for Statusline `1.0` (`2`). This file records reproducible readiness evidence without storing credentials or personal account data.

## Passed

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

## Remaining follow-ups

- Wait for App Review to approve or request changes for version `1.0` (`2`).
- After approval, make the explicit manual-release decision in App Store Connect.
- Independently wait for build `1` Beta App Review, then verify that the external tester receives access.
