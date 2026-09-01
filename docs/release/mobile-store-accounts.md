# Mobile store account decisions

Validated on 1 September 2026. Recheck the linked store requirements immediately before submission because platform policies can change.

## Shared product contact

- Public support email: `founder@inmerzion.io`
- Public privacy URL: https://statusline-relay.inmerzion.workers.dev/privacy
- Public support URL: https://statusline-relay.inmerzion.workers.dev/support

## Google Play

### Account selected

Use a **Personal** Play Console account owned by `founder@inmerzion.io`.

Decision recorded on 1 September 2026: Inmerzion is currently a brand/project with the `inmerzion.io` domain, not a legally registered organization, and has no D-U-N-S number. The public developer name can be **Inmerzion**, while account verification must use the owner's real legal identity and personal Google payments profile.

If Inmerzion becomes a legal entity later, review Google's current account and app-transfer process before changing ownership. Do not create a second listing or register a different package name merely to change account type.

### Current requirements

Google currently charges a one-time USD 25 registration fee. New Personal accounts must also verify access to an Android device and complete a closed test with at least 12 continuously opted-in testers for 14 days before applying for production access.

Official references:

- https://support.google.com/googleplay/android-developer/answer/6112435
- https://support.google.com/android-developer-console/answer/16641046
- https://support.google.com/googleplay/android-developer/answer/14151465

The canonical Android application ID is `inmerzion.statusline`. Do not create a different Play Console package unless the product is intentionally being forked: package IDs cannot be casually renamed after publication.

### Current account and app state

As of 1 September 2026, the Personal developer account owned by `founder@inmerzion.io` is registered and its one-time fee has been paid. The Play Console application **Statusline** has been created with package name `inmerzion.statusline`.

The first signed upload bundle is version `0.1.8` (`versionCode 4`). It was produced by workflow run [33498280582](https://github.com/arvivares/statusline/actions/runs/33498280582) with the stable upload key documented in the release checklist. Upload the `.aab`, not the debug APK, when creating the first Play testing release.

## Apple App Store

The first release is **iPhone only**, including its widget. iPad remains a later product decision. The public contact and policy URLs above will be used in App Store Connect.

The canonical bundle IDs remain:

- app: `inmerzion.statusline`;
- widget: `inmerzion.statusline.widget`.
