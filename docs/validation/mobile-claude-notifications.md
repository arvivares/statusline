# Mobile Claude and iOS notification activation

Candidate working branch: `feat/mobile-claude-notifications`, based on main
`ce78634a5aa834176040c3b46df829d625374187`. Validation date: 13 October 2026.
No production store, existing pairing, phone installation or relay deployment
was changed. Source delivery numbers are prepared as iOS **1.1.4 (13)** and
Android **0.1.39 (37)**. The full runtime QA below preceded that metadata-only
bump; subsequent release preflight verifies component version agreement.

## Changes

- Both mobile readers recognize `claude` from the authoritative Companion
  inventory. Company/tool identity is **Anthropic · Claude Code**.
  Five hours is the default, with an explicit weekly fallback. Missing windows
  remain unknown; unavailable/removal never imply 0% or 100%.
- Generic app focus/watchlist and widget focus support three services. Medium
  iOS widgets compact the two secondary rows. Android keeps its 1×4 focused
  default; taller widgets show both secondary rows when height/font scale permit.
- iOS saves the chosen notification category after affirmative system permission,
  independently of APNs/Firebase/relay readiness. Pending registration is visible
  and retried on the existing active-app cadence. Failed delivery registration
  no longer silently discards the accepted choice.
- Explicit FCM registration completion precedes FID retrieval. Attempt-scoped
  deadlines cannot interrupt a subsequent registration. Denied permission,
  independent category choices, permission revocation and opt-out remain honored.
  Manual and foreground renewals cannot write after disconnect's final DELETE.

The schema/AES AAD, relay authorization, credentials, pairing, provider count and
payload bounds are unchanged. No migration, server deployment, vendor credential
access or notification auto-enablement is required for adding Claude.

## Local checks

- Xcode 27.0 / Swift language mode 5 with the existing MainActor/approachable
  concurrency settings; app, widget and test targets compile for the simulator.
  Firebase resolves to the existing permitted 12.19.2 release. No dependency
  manifest was upgraded. The initial `.shared` existential compiler error was
  corrected before validation.
- Latest full Swift unit pass: **55 test definitions / 113 parameterized
  invocations passed**, zero failures or skips, on the isolated iPhone 17e / iOS
  27 simulator. Both notification categories are tested at permission denial,
  APNs/Firebase delay and relay failure, including recovery and late completion
  after disconnect. The guarded synthetic capture fixture passed.
  A final Spanish pass on the last compiled source also passed all 55 definitions
  / 113 invocations, without failures or skips.
- Final Android source: **42 unit tests passed**, zero failures/errors, and
  `lintRelease` succeeded. Production debug/release Kotlin and resources compiled;
  no APK was installed or signed for distribution.
  The subsequent density-aware row change exposed a missing `Context` parameter;
  that compile error was corrected. The final two-row design uses a separate XML
  resource instead of reflective minimum-height setters. Gradle 10/deprecated
  Android notification-builder warnings are pre-existing, not new build errors.
- Shared synthetic fixture: [services-claude-v1.json](../../protocol/fixtures/services-claude-v1.json).
  Existing legacy and services AES vectors remain unchanged and tested.
- EN/ES catalog generation/source references passed (675 messages / 760 source
  references). Markdown links and JSON validation passed; recheck at handoff.
- App/widget processed-plist configuration guard: **23 tests passed**.
- [Focused security review](../security/mobile-claude-notifications/THREAT-MODEL.md)
  covers the reader and permission/registration boundaries.

QA uses the isolated **Statusline Mobile Claude QA** iPhone 17e simulator on iOS
27, public synthetic readings and no pairing. The explicit capture permit and
unpaired checks prevent fixture seeding on physical or paired devices. Real
XCUITest controls, not ImageRenderer's unsupported Picker placeholder, are the
app UI validation source. ImageRenderer remains useful for native widget captures.
Logs and xcresults stay outside the repository; no live account data is captured.
The unsigned fixture attempt was rejected by the simulator Keychain. Ad-hoc
simulator signing fixed that QA setup without touching distribution entitlements.
UI must be run **after** the separate fixture/unit step: Xcode does not guarantee
ordering across unit/UI targets. The initial combined-target UI run lacked seeded
data; a later run exposed a test selector relying on a Picker label not used by
UIKit. The corrected test targets the segmented control and stable quota values.
Both final native UI tests passed: English and Spanish, Claude five-hour focus,
weekly selection/fallback label, return to five hours, both watchlist controls
and the company/tool heading. Native screenshots were retained in xcresult,
not uploaded to either store.

APNs renewal now waits for the fresh system callback even when the Firebase SDK
has a cached token. See [Apple's registration guidance](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns)
and [FCM registration completion](https://firebase.google.com/docs/reference/swift/firebasemessaging/api/reference/Classes/Messaging).

The original project directory's 31 pending entries were preserved; work is in
the separate feature worktree. `gradlew.bat` has a pre-existing CRLF clean-filter
diff on fresh checkout, but its raw blob hash still matches main exactly
(`03754c4c3d9206f5c9ef69e41990dfe26a05251e`); do not stage that unrelated
normalization in the feature PR. The locally generated SwiftPM resolution file
and temporary simulator capture permit are not feature source artifacts.

## Remaining distribution gates

1. Commit/PR and CI validation, then signed-tag release preflight and packaging;
   source build numbers are allocated without replacing any existing release.
2. Test the new signed binary on an affected physical iPhone: accept the initial
   system prompt, confirm the category stays on, then verify pending/recovery and
   real APNs/FCM delivery. Simulator mocks do not prove physical push delivery.
3. Validate Android app/widget/QR and three-service layout through the beta store
   channel, retaining pairing and notification choices.
4. Capture native five-image EN/ES store sets for the new three-service UI and
   update metadata only when the corresponding binaries are ready.
