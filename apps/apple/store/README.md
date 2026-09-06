# Apple App Store release kit

This directory is the versioned source of truth for the first Statusline iPhone release. The current source targets bundle `inmerzion.statusline`, version `1.0` and build `4` for unified-brand and localization testing in TestFlight. The App Store submission still uses build `2` until physical QA and an explicit decision to replace it.

## App record

- Platform: iOS
- Name: Statusline
- Primary language: Spanish (Spain)
- Bundle ID: `inmerzion.statusline`
- SKU: `statusline-ios`
- Apple ID: `6807851320`
- App Store submission: `1.0` (`2`)
- Latest TestFlight candidate: `1.0` (`4`), unified icon and English/Spanish localization
- Price: Free
- Availability: 174 App Store countries or regions; China mainland excluded (Hong Kong and Macau unchanged)
- Distribution: Public, iPhone only
- Primary category: Developer Tools
- Secondary category: Utilities
- Copyright: `2026 Alan Rodrigo Vivares`
- Privacy policy: https://statusline-relay.inmerzion.workers.dev/privacy
- Support URL: https://statusline-relay.inmerzion.workers.dev/support
- Marketing URL: https://github.com/arvivares/statusline

The current App Store submission uses Spanish as its primary localization because build `2` is presented in Spanish. Build `3` adds English and Spanish according to the primary system language, with English as the fallback. English product-page metadata is prepared in `listing/en-US.md`; enable it and refresh localized screenshots when the localized binary is selected for App Review, after TestFlight QA.

The App Store Connect record, product-page metadata, screenshots, age rating and published privacy label were configured on 2 September 2026. Build `1` passed physical TestFlight QA and entered Beta App Review for `External Beta`. On 3 September, build `2` replaced the iOS icon with the shared Data Plane artwork, processed as valid, was attached to version `1.0` and was submitted to App Review. The same build was installed and confirmed operational on the physical iPhone. As verified on 6 September, both builds are **Testing** in `Internal QA` and `External Beta`; the App Store submission is **Waiting for Review** with manual release selected. Private review contacts and notes are saved in App Store Connect; tester identities and phone numbers remain outside the repository. Remaining follow-ups are recorded in `validation.md`.

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

The account holder chose to test this build in TestFlight first. Do not remove or
replace the waiting `1.0 (2)` App Store submission, change its saved Review Notes,
or distribute build `3` to external testers as part of that internal QA step.
`Internal QA` uses automatic Xcode-build distribution; Apple Silicon Mac and
Vision Pro testing remain disabled. App Store Connect processed build `3` as
**Validated**, detected **English, Spanish**, and lists it as **Testing** in
`Internal QA`. Spanish What to Test notes are saved; the English equivalent is
prepared locally. The build-specific EN/ES instructions are in `testflight/`, and
upload/validation evidence is tracked in `validation.md`.

## Unified-brand candidate — 6 September 2026

Build `1.0 (4)` packages the unified segmented Statusline icon from `v0.1.12`,
retaining the English/Spanish app and widget behavior introduced in build `3`.
The app and extension build numbers are advanced together. This candidate is
prepared for manual upload and internal TestFlight testing; preparing the source
does not mean that Apple has processed it or that physical QA has passed.

The current What to Test files in `testflight/` target build `4`. Verify the new
Home Screen and Settings icon, then recheck localization, pairing persistence and
widget updates on a physical iPhone. Do not replace the waiting build `2` App Store
submission or change its review metadata as part of this internal test.

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
