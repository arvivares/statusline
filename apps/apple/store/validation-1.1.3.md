# iOS quota-alert candidate — 1.1.3 (12)

## Verified locally on 2 October 2026

- Source starts from reviewed main commit
  `dc0a00dd496e0f5f0121a4fb470b514d63b55447` (Companion/Android 0.1.34),
  with app and widget version-only changes to `1.1.3 (12)`.
- Generated one Release archive with Xcode 27, reusing the existing Firebase
  package checkout and device build cache. Exported that same archive using
  automatic App Store Connect distribution signing. Reused that archive for the
  successful upload recorded below; no second archive was needed.
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
- The complete `statuslineTests` suite passed on an isolated iPhone 17 Pro
  simulator running iOS 27: 80 test cases passed, one fixture-seeding test skipped,
  zero failures and zero runtime warnings. The Xcode result summary groups these
  into 42 passed test methods and one skipped method; parameterized runs account
  for the larger case count. This includes push-category preferences and relay
  compatibility checks, but not physical APNs delivery or a real quota rollover.
- Exported IPA SHA-256:
  `a737e9820c346f1e88cf71eb045959f9611f3069f21e420c7b10b2e6531a1f51`.
  Apple may re-sign the archive on upload; that upload can have a different hash.

## Internal TestFlight delivery — 2 October 2026

- Apple authentication was restored. Xcode reported successful upload at
  **20:29:33 Europe/Madrid**; the package subsequently completed processing.
- The iOS Builds page shows `1.1.3 (12)` as **Ready to Submit**, assigned to
  **Internal QA**. That group's Builds tab separately confirms **Testing** for
  build 12. The group contains only the account holder; no tester was added.
- Saved the complete English and Spanish What to Test notes linked below.
  No External Beta review or App Store submission was requested.
- Updated and published the global App Privacy label after inspecting the
  exact exported SDK privacy manifests. The data types, purposes and linkage
  answers are recorded in [app-privacy.md](app-privacy.md). This does not publish
  a new binary or deploy the website policy.
- The Distribution page still shows `1.1.1` as **Ready for Distribution**.
  Build 12 is an internal test candidate, not an App Store release.

## Physical TestFlight and push QA — 2–3 October 2026

- After the operator reconnected the iPhone, CoreDevice recovered its USB
  connection. The Mac/iPhone development trust was confirmed successfully;
  this is separate from Statusline's unchanged relay pairing.
- Installed only a signed private `statuslineUITests` runner. `UseDestinationArtifacts`
  controls the installed TestFlight app instead of replacing Statusline with an
  old Debug host. Changes to the helper stayed outside the repository/archive.
- The TestFlight upgrade case passed at **23:49 Europe/Madrid on 2 October**.
  A scoped installed-app query separately confirmed **1.1.3 (12)**. Existing
  pairing/providers remained available; credits were **on**, new quota alerts
  **off**, and both controls were enabled. No QR re-pairing or app-data reset.
- Initial helper attempts were blocked by device relocking and TestFlight's
  non-hittable text selector. Later quota attempts exposed the multiline Toggle's
  outer accessibility container and one `kAXErrorServerNotFound` helper failure.
  Updated the private interactions using the verified own-row frames; these
  failures are not presented as a completed physical QA pass or an app-code fix.
- After temporary quota opt-in, production Firebase/APNs delivered both isolated
  synthetic notifications while Statusline was backgrounded: **Codex: quota
  available again** and **Codex: use your weekly quota**. XCTest observed each
  exact English title and captured only that title, not the user's home screen.
  The exported crops were inspected. They are QA evidence, not store screenshots.
- Diagnostic channels copied only the approved encrypted routing registration.
  No FID decryption, real-channel credential change or fabricated quota snapshot.
  Repeating each event ID retained one completed relay event. All three newly
  created recovery/weekly/opt-out diagnostic channels, registrations and events
  were removed, with absence checked after each deletion.
- The combined transport case failed its final 45-second UI restoration wait;
  its successful notification observations are recorded separately, not relabeled
  as an overall passing test. A follow-up read-only UI test **passed at 00:09:47
  on 3 October**, confirming **credits on / quota off**, both enabled, and
  "Notification preferences updated." The original iPhone preferences are restored.
- The relay confirmed credit-only restoration and no quota capability on the
  copied opt-out registration. Its next event was acknowledged without an enabled
  quota recipient; this is a server-side suppression check, not a physical
  no-banner observation. A later global-count assertion found a new quota opt-in:
  the operator confirmed they intentionally enabled it on **Android** afterwards.
  That Android choice was preserved; it is not an iPhone restoration failure.
- Independent widget refresh, physical Spanish/fallback notifications and real
  provider quota rollover were **not** established by these transport tests.

## Device and broader distribution gates still open

- The public website privacy page still states an effective date of 21 September
  and omits Firebase and quota notifications. Relay privacy URLs redirect there,
  so they are not an alternative current policy. The updated site source is on
  main; the operator confirmed they will handle deployment. Verify the live
  policy before broader distribution; no site deployment is claimed here.
- Build-12 installation, preserved category defaults and both synthetic APNs
  transport observations are confirmed above. The combined test still did not
  finish green: repeat the complete opt-in/opt-out sequence with a stable physical
  UI session, including observing suppression with the app backgrounded.
- Complete independent widget synchronization and any physical ES/fallback matrix
  cases before broader distribution. Do not replace an active encrypted quota
  snapshot with fabricated values to make a widget/notification test pass.
- A real provider exhaustion/recovery or last-hour weekly warning remains a
  separate observation. Transport acceptance and synthetic events are not proof
  of a vendor quota rollover or precisely scheduled delivery.

Prepared What to Test instructions:
[English](testflight/1.1.3-12-en-US.txt),
[Spanish](testflight/1.1.3-12-es-ES.txt).

Related Android staging is recorded in
[the Android 0.1.34 validation record](../../android/store/validation-0.1.34.md).
Only account-holder internal delivery is confirmed. No broader mobile-store
publication, tester-list change or new GitHub installer release was performed.

## Primary references checked for this preparation

- [Apple App Privacy definitions](https://developer.apple.com/app-store/app-privacy-details/)
- [Firebase Apple data disclosure](https://firebase.google.com/docs/ios/app-store-data-collection)
