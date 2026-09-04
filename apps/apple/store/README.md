# Apple App Store release kit

This directory is the versioned source of truth for the first Statusline iPhone release. The current kit targets bundle `inmerzion.statusline`, version `1.0` and build `2`.

## App record

- Platform: iOS
- Name: Statusline
- Primary language: Spanish (Spain)
- Bundle ID: `inmerzion.statusline`
- SKU: `statusline-ios`
- Apple ID: `6807851320`
- Version/build: `1.0` (`2`)
- Price: Free
- Availability: all 175 App Store countries or regions
- Distribution: Public, iPhone only
- Primary category: Developer Tools
- Secondary category: Utilities
- Copyright: `2026 Alan Rodrigo Vivares`
- Privacy policy: https://statusline-relay.inmerzion.workers.dev/privacy
- Support URL: https://statusline-relay.inmerzion.workers.dev/support
- Marketing URL: https://github.com/arvivares/statusline

The first submission uses Spanish as its primary localization because the current iPhone binary is presented in Spanish. English metadata is prepared in `listing/en-US.md` but should only be enabled when the corresponding binary localization is ready.

The App Store Connect record, product-page metadata, screenshots, age rating and published privacy label were configured on 2 September 2026. Build `1` passed physical TestFlight QA and remains in Beta App Review for `External Beta`. On 3 September, build `2` replaced the iOS icon with the shared Data Plane artwork, processed as valid, was attached to version `1.0` and was submitted to App Review. The same build was installed and confirmed operational on the physical iPhone. App Store Connect reports the submission as **Waiting for Review** with manual release selected. Private review contacts and notes are saved in App Store Connect; tester identities and phone numbers remain outside the repository. Remaining follow-ups are recorded in `validation.md`.

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
