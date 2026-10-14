# iOS 1.1.5 (14) — settings and notification controls

## Scope — 14 October 2026

- Candidate based on `94de6586c974c0d86a6e923ce9240396c43a7033` (v0.1.39).
- Move refresh/settings to the top-right of the overview. Group notifications,
  private sync and Privacy / Support in a flat, localized settings sheet.
- Preserve native Still Signature quotas, all three services, the widget,
  app-group/signing identity, encrypted services-v1 and existing pairing.
- Keep switches available while APNs/FCM/relay work is pending; serialize writes
  against opt-out, cancel SDK waits, retain failed cleanup for retry, and add
  privacy-safe stage diagnostics. No relay or Firebase configuration change.
- On the affected physical iPhone, build 1.1.4 (13) reproduced dimmed controls
  during pending registration. Baseline preferences were restored to both ON.
  That observation is not a successful test of this new candidate.
- App Store Connect was read on 14 October: 1.1.4 is now Ready for Distribution.
  A later 1.1.5 submission therefore must be a new version, not a replacement of
  an in-review binary. No new submission is claimed by this preparation record.

## Local verification

The initial incremental simulator build compiles the new UI and push flow using
Xcode 27 and the previously tested Firebase 12.19.2 packages, without updating
dependencies. The initial suite passed and all four EN/ES UI cases passed: Claude
focus/period selection, the Settings route, removed overview controls and legal
links inside Settings. One unrelated test was skipped by its existing guard.
After adding the explicit Firebase proxy configuration guard, the final English
Swift suite passed (62 definitions) in English and Spanish. The Spanish QR-sheet
route from Settings also passed. Public, synthetic [native captures](../../../docs/validation/assets/ios-settings-1.1.5/README.md)
record the actual overview and flat Settings; private phone logs stay off-repository.

Desktop release checks passed: catalog, metadata, formatting, 455 local links,
319 tests (one pre-existing skip), and TypeScript. These are not native installed
desktop or Android store tests.

## Affected physical iPhone

- iPhone 17 Pro, iOS 27.0 (24A437), connected by USB. Installed the candidate
  in place without uninstalling, changing its pairing or requesting a new system
  notification permission. Live quotas continued syncing with the same Companion.
- The first diagnostic candidate kept switches responsive but APNs registration
  still timed out. The final candidate disables Firebase delegate proxying, per
  the [official SwiftUI guidance](https://firebase.google.com/docs/ios/learn-more#swiftui),
  while retaining the existing manual APNs token mapping.
- On launching the final candidate at 23:39 Europe/Madrid, registration reached
  Firebase ready and relay ready. Repeated the real OFF/OFF → ON/ON cycle: relay
  cleanup completed at 23:40:15; APNs reuse, Firebase ready and relay ready were
  observed for the new activation at 23:40:50. Both switches remained usable.
- Read back only preference booleans after the cycle: both categories ON,
  pending registration OFF, pending unregistration OFF, SDK auto-init ON. This
  restores the original choices and confirms registration, not merely permission.
- Inspected the actual overview and Settings on the phone. Refresh/settings are
  top-right icons; all three settings sections and the legal links are present.
  No synthetic quota/cache was seeded into this device.
- This local validation used a development APNs entitlement from the archive.
  It does not prove fresh production APNs delivery, a delivered alert, background
  widget scheduling or behavior on every supported iPhone/iOS release.

## Signed delivery

The final Release archive is 1.1.5 (14), built from the tested package versions.
After the owner renewed Xcode's expired account session, App Store export passed.
Strict recursive signature verification passed with production APNs,
get-task-allow=false and the existing app group. Packaged app/widget endpoints
and versions match. Both bundles passed 678-message EN/ES/fallback localization
and 16 locale-resolution cases. Firebase client values are not recorded here.

Exported IPA SHA-256:
`0aab7ffc5a6999fdb33d1b1f4cea45961dbee9f092fb152814f7dc7e91410980`.

App Store Connect has a new 1.1.5 draft; 1.1.4 remains Ready for Distribution.
Upload, processing, review submission and approval are not claimed until verified.

No pairing token, notification routing identifier, production credential or
private device log is included in this record.
