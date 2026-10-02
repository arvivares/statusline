# iOS quota-alert candidate — 1.1.3 (12)

## Verified locally on 2 October 2026

- Source starts from reviewed main commit
  `dc0a00dd496e0f5f0121a4fb470b514d63b55447` (Companion/Android 0.1.34),
  with app and widget version-only changes to `1.1.3 (12)`.
- Generated one Release archive with Xcode 27, reusing the existing Firebase
  package checkout and device build cache. Exported that same archive using
  automatic App Store Connect distribution signing; no upload has occurred.
- Both archived and exported bundles passed the mandatory relay guard: matching
  production HTTPS endpoint, marketing version and build number in the app/widget.
- The exported app passed strict recursive signature verification. Its signed
  entitlements include `aps-environment=production`, `get-task-allow=false`,
  `beta-reports-active=true`, the original application identifier and the unchanged
  `group.inmerzion.statusline` App Group. Firebase project configuration is present;
  client configuration and signing material remain outside the repository.
- Compiled localization validation passed for app and widget: 671 messages across
  English, Spanish and fallback, plus 16 primary-language resolution cases.
- Local release preflight, formatting, localization, documentation links and
  frontend checks passed (315 tests passed, one skipped). These checks are not
  evidence of physical notification delivery.
- Exported IPA SHA-256:
  `a737e9820c346f1e88cf71eb045959f9611f3069f21e420c7b10b2e6531a1f51`.
  Apple may re-sign the archive on upload; that upload can have a different hash.

## Store and device gates still open

- App Store Connect requests authentication. No live latest-build, current App
  Privacy label, TestFlight processing or Internal QA assignment is claimed for
  this candidate. Verify the live listing before allocating/submitting the build.
- The public website privacy page still states an effective date of 21 September
  and omits Firebase and quota notifications. Relay privacy URLs redirect there,
  so they are not an alternative current policy. The updated site source is on
  main; publishing that site remains the operator's responsibility.
- Reassess Apple's current privacy questionnaire using the exact bundled SDKs.
  Declare opt-in installation identifiers and quota-alert metadata, for app
  functionality with no tracking/advertising. Do not treat a retained installation
  identifier as anonymous solely because there is no account/email: Apple includes
  device linkage in its identity question. Verify the actual linkage choices
  before publishing the disclosure; this record does not assert those choices
  were already saved in the portal.
- The connected iPhone initially reported the previous `1.1.2 (11)` installation;
  it later became unavailable. No new build was installed and no existing pairing
  or notification preference was changed during this preparation.
- Complete a TestFlight upgrade, independent widget synchronization, category
  opt-in/opt-out preservation and real APNs delivery before broader distribution.
  Use an isolated diagnostic registration for synthetic transport checks; do not
  replace the active encrypted quota snapshot with fabricated values.
- A real provider exhaustion/recovery or last-hour weekly warning remains a
  separate observation. Transport acceptance and synthetic events are not proof
  of a vendor quota rollover or precisely scheduled delivery.

Prepared What to Test instructions:
[English](testflight/1.1.3-12-en-US.txt),
[Spanish](testflight/1.1.3-12-es-ES.txt).

Related Android staging is recorded in
[the Android 0.1.34 validation record](../../android/store/validation-0.1.34.md).
No mobile-store publication, tester-list change or new GitHub installer release
is implied by these source/version updates.

## Primary references checked for this preparation

- [Apple App Privacy definitions](https://developer.apple.com/app-store/app-privacy-details/)
- [Firebase Apple data disclosure](https://firebase.google.com/docs/ios/app-store-data-collection)
