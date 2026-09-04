# Mobile store account decisions

Last reviewed on 4 September 2026. Recheck the linked store requirements immediately
before submission because platform policies can change.

## Shared product contact

- Public support email: `founder@inmerzion.io`
- Public privacy URL: https://statusline-relay.inmerzion.workers.dev/privacy
- Public support URL: https://statusline-relay.inmerzion.workers.dev/support
- Public data-deletion URL: https://statusline-relay.inmerzion.workers.dev/delete-data

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

As of 2 September 2026, the Personal developer account owned by `founder@inmerzion.io` is registered and its one-time fee has been paid. The Play Console application **Statusline** uses package name `inmerzion.statusline`.

The first signed upload bundle was version `0.1.8` (`versionCode 4`). It was produced by workflow run [33498280582](https://github.com/arvivares/statusline/actions/runs/33498280582) with the stable upload key documented in the release checklist.

The last Internal testing release before the closed test was `0.1.9` (`versionCode 5`).
Workflow run [33512410921](https://github.com/arvivares/statusline/actions/runs/33512410921)
produced the signed AAB/APK, checksums, R8 mapping and an automated ML Kit
registrar-constructor check. Google Play made it available to internal testers on 1
September 2026. Upload the `.aab`, not the APK, to Play Console; keep the APK only for
direct artifact validation.

The current closed-testing submission is `0.1.10-alpha.1`, backed by bundle `0.1.10` (`versionCode 6`) from workflow run [33545843193](https://github.com/arvivares/statusline/actions/runs/33545843193). On 2 September 2026 it was submitted to Google together with:

- the complete default `en-US` store listing, icon, feature graphic and four phone screenshots;
- Content Rating, 18+ target audience, privacy, ads, health, government and financial declarations;
- Data safety disclosure for optional bundled ML Kit telemetry;
- an Advertising ID answer of **No**, verified against source and the signed bundle;
- the public privacy, support and data-deletion pages;
- the closed Alpha track in all 177 available countries and regions, using the `Statusline Internal` email list and `founder@inmerzion.io` for feedback.

The submission is in review. Managed publishing is off, so approved closed-test changes become available automatically. Once the opt-in links activate, at least 12 testers must join and remain continuously opted in for 14 days before this Personal account can apply for production access. The canonical web opt-in URL is https://play.google.com/apps/testing/inmerzion.statusline; do not start counting until Play Console reports at least 12 opted-in testers.

Play reports one non-blocking artifact warning: the AAB contains native code without a native debug-symbol archive. R8 `mapping.txt` is attached, but native symbols should be investigated before the production release.

## Apple App Store

The first release is **iPhone only**, including its widget. iPad remains a later product decision. The public contact and policy URLs above will be used in App Store Connect.

The canonical bundle IDs remain:

- app: `inmerzion.statusline`;
- widget: `inmerzion.statusline.widget`.
