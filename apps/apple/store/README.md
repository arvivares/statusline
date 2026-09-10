# Apple App Store release kit

This directory is the versioned source of truth for Statusline iPhone releases. The latest upload is `inmerzion.statusline` version `1.0.1`, build `6`, accepted for processing on 10 September 2026 at 17:08 Europe/Madrid. TestFlight availability is not yet verified. The separate App Review submission still uses build `5`, last verified as **Waiting for Review**, and was not replaced by this upload. The published release remains `1.0 (4)`, manually released on 9 September 2026. See `validation.md` for dated evidence.

**Do not publicly release build 5:** subsequent physical-device diagnosis and
inspection of the exported IPA confirmed that its widget's relay endpoint is
empty. Foreground app refresh works, but independent widget synchronization does
not. The corrected `1.0.1 (6)` has been built locally in Release configuration,
development-signed and installed over the existing app by USB. An independent
widget fetch was verified with the same pairing and an unchanged app-owned cache.
It also adds shared project configuration and a mandatory bundle-validation gate.
Build 6 has now also been archived, distribution-signed, validated in the exported
IPA and uploaded for TestFlight. Apple acknowledged processing; completed
processing and internal-test availability still need verification in App Store Connect.
The local USB test is not a test of the distribution-signed TestFlight upgrade.
Build 6 has **not** replaced the existing App Review submission.

## App record

- Platform: iOS
- Name: Statusline
- English product-page name: `Statusline: Agent Quota`, authorized by the account holder because `Statusline` was unavailable in that localization. The installed app name and Spanish listing remain `Statusline`; this version supports Codex only.
- Primary language: Spanish (Spain)
- Bundle ID: `inmerzion.statusline`
- SKU: `statusline-ios`
- Apple ID: `6807851320`
- App Store release: `1.0` (`4`), **Ready for Distribution**, manually released 9 September 2026 (Europe/Madrid)
- Published 1.0 submission ID: `9de1d3a4-27a7-403f-aa7f-12de04c9db4f`
- Public link: https://apps.apple.com/app/statusline/id6807851320
- Latest TestFlight upload: `1.0.1` (`6`), upload succeeded; processing completion and `Internal QA` assignment not yet verified
- App Store candidate: `1.0.1` (`5`), last verified **Waiting for Review**, submitted 10 September 2026; known widget-endpoint defect, do not publicly release
- Current submission ID: `4d9e9b63-5ccd-474a-ad90-dbae5eda8a70`
- Price: Free
- Availability: 174 App Store countries or regions; China mainland excluded (Hong Kong and Macau unchanged)
- Distribution: Public, iPhone only
- Primary category: Developer Tools
- Secondary category: Utilities
- Copyright: `2026 Alan Rodrigo Vivares`
- Privacy policy: https://statusline.inmerzion.io/privacy
- Support URL: https://statusline.inmerzion.io/support
- Candidate marketing URL: https://statusline.inmerzion.io/

The published product page retains its original metadata until the new version is released. The `1.0.1` submission has Spanish (Spain) and English (U.S.) descriptions, promotional text, keywords, what's new and version URLs from `listing/`, plus localized names/subtitles and privacy links. Each locale has one reviewed, native-size build-5 overview screenshot; smaller iPhone sizes use the matching language's 6.9-inch image. The three old Spanish screenshots were removed from the draft, not from the historical files. The scrolled editor's status-bar overlap and simulator camera-unavailable screen were excluded during visual review. See [capture provenance](assets/README.md).

The App Store Connect record, product-page metadata, screenshots, age rating and published privacy label were configured on 2 September 2026. Build `1` passed physical TestFlight QA and entered Beta App Review for `External Beta`. On 3 September, build `2` replaced the iOS icon with the shared Data Plane artwork, processed as valid, was attached to version `1.0` and was submitted to App Review. The same build was installed and confirmed operational on the physical iPhone. As verified on 6 September, both builds are **Testing** in `Internal QA` and `External Beta`; the App Store submission is **Waiting for Review** with manual release selected. Private review contacts and notes are saved in App Store Connect; tester identities and phone numbers remain outside the repository. Remaining follow-ups are recorded in `validation.md`.

## Synchronization candidate — 10 September 2026

The iPhone app and widget target `1.0.1 (6)` together. The local USB update
preserved pairing and confirmed a first independent widget fetch. The
distribution-signed TestFlight upgrade and recurring refresh still need testing:
open the app once after upgrading, then
observe a newer widget sample without reopening the app. WidgetKit controls the
actual reload schedule. The foreground loop, offline fallback, sample age and
disconnect/re-pair guards also require QA. EN/ES instructions are in `testflight/`.

Build-6 archive, export, packaged-endpoint/signature/localization checks and manual
upload are complete. Xcode reports upload success and Apple acknowledged package
processing. Verify TestFlight availability and `Internal QA` in App Store Connect,
then save the prepared EN/ES What to Test notes. The earlier build-5 submission
with localized captures and review notes remains unchanged; it must not be
publicly released. Release stays manual; pricing, territories and the published
binary are unchanged.

## Public release — 9 September 2026

After Apple approval and explicit account-holder authorization, confirmed
**Release This Version** for the existing `1.0 (4)` binary in 174 countries or
regions. Reloading the delivered version confirms **Ready for Distribution**
and build `4`; the release button is no longer present. Free pricing, public
iPhone-only distribution and the China mainland exclusion were verified before
release and left unchanged. No rebuild, upload, metadata or TestFlight changes
were needed.

The public link returned Apple's page-not-found screen immediately after release.
Later on 9 September, the account holder confirmed that the public listing was
visible. This does not establish availability in every enabled region or a new
installation from the public App Store; the latter remains a QA follow-up.

## Build 4 App Review submission — 7 September 2026

With the account holder's authorization after physical-iPhone testing, withdrew
the queued build `2`, selected the existing `1.0 (4)` upload and updated the review
notes. No recompilation or binary upload was needed. After reauthentication,
verified the saved notes and build, then completed **Submit for Review**.

Reloaded the new submission and the version page: both confirm **Waiting for
Review** for `1.0 (4)`, submission `9de1d3a4-27a7-403f-aa7f-12de04c9db4f`.
The video remains attached, no login is required, China mainland remains excluded
and release is manual. The notes explicitly explain that the existing video
predates build `4`. No pricing, product-page, public-release or external TestFlight
changes were made. The dated sections below describe the earlier submission and
internal-test stages, not the current public-release state.

## App Review follow-up — 6 September 2026

Apple's 5 September review of `1.0 (2)` rejected the submission under Guideline 5
because China mainland was enabled and the metadata references OpenAI. The reviewer
explicitly offered removing the China mainland storefront as an alternative to
changing the app's functionality and metadata for that territory.

On 6 September, China mainland was deselected and App Store Connect confirmed
**Not Available**. All other 174 storefronts retain **Available on App Release**,
including Hong Kong and Macau. No binary, pricing or distribution-method change is
required for this availability correction. Keep China mainland excluded in future
submissions unless its distribution is separately reassessed and authorized.

The revised notes in `app-review.md` preserve the existing physical-device video and
review instructions, clarify that Statusline displays usage metadata rather than
generating AI content, and replace the previous all-regions availability claim.
These notes were saved in App Store Connect and verified after reloading the version
page. On 6 September, the corrected `1.0 (2)` submission was resubmitted and App Store
Connect confirmed **Waiting for Review** for both the submission and its app-version
item. This is a received submission, not an approval. See `validation.md` for the
current follow-ups. That availability correction did not require a new build.

## Localization candidate — 6 September 2026

Build `1.0 (3)` packages the EN/ES corrections from the `v0.1.11` source for both
the iPhone app and WidgetKit extension. Only the iOS build number changes; no new
desktop/Android installers or GitHub tag are required.

The account holder chose to test this build in TestFlight first. That internal QA
step did not authorize replacing the then-waiting `1.0 (2)` App Store submission,
changing its saved Review Notes or distributing build `3` externally.
`Internal QA` uses automatic Xcode-build distribution; Apple Silicon Mac and
Vision Pro testing remain disabled. App Store Connect processed build `3` as
**Validated**, detected **English, Spanish**, and lists it as **Testing** in
`Internal QA`. Spanish What to Test notes are saved; the English equivalent is
prepared locally. The build-specific EN/ES instructions are in `testflight/`, and
upload/validation evidence is tracked in `validation.md`.

## Unified-brand candidate — 6 September 2026

Build `1.0 (4)` packages the unified segmented Statusline icon from `v0.1.12`,
retaining the English/Spanish app and widget behavior introduced in build `3`.
The app and extension build numbers are advanced together. A single archive was
exported, validated and manually uploaded. App Store Connect reports **Validated**
and `Internal QA` lists `1.0 (4)` as **Testing**. Physical-device QA was pending
at upload time; the later account-holder confirmation is recorded above.

At that stage, the What to Test files targeted build `4`; those Spanish notes
were saved in App Store Connect and verified after reloading. Verify the new
Home Screen and Settings icon, then recheck localization, pairing persistence and
widget updates on a physical iPhone. This internal test itself did not authorize
replacing build `2` or changing review metadata; that separate authorization and
submission followed on 7 September.

## Contents

- `listing/`: localized product-page copy.
- `app-review.md`: exact reviewer path and notes.
- `app-privacy.md`: App Privacy inventory and proposed answers.
- `age-rating.md`: answers for Apple's current age-rating questionnaire.
- `compliance.md`: encryption, content-rights and DSA decisions.
- `validation.md`: dated release-readiness evidence and remaining account-side actions.
- `testflight/`: beta description and What to Test copy.
- `assets/`: screenshot requirements, source captures and final listing order.
- `ExportOptions.plist`: reproducible automatic-signing export configuration. It exports locally; uploading remains an explicit release action.
- `ExportOptions-Upload.plist`: the matching explicit App Store Connect upload configuration.

Do not store Apple credentials, signing keys, personal addresses, phone numbers, pairing links or reviewer secrets in this directory.
