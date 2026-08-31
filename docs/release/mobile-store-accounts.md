# Mobile store account decisions

Validated on 1 September 2026. Recheck the linked store requirements immediately before submission because platform policies can change.

## Shared product contact

- Public support email: `founder@inmerzion.io`
- Public privacy URL: https://statusline-relay.inmerzion.workers.dev/privacy
- Public support URL: https://statusline-relay.inmerzion.workers.dev/support

## Google Play

`founder@inmerzion.io` can own or administer the Play Console account because it is a Google/Google Workspace account. The email domain does not determine the legal account type:

- choose **Organization** only if Inmerzion is a legally registered business or organization and its legal details, website and D-U-N-S number can be verified;
- otherwise choose **Personal** and use the legal identity requested by Google.

Google currently charges a one-time USD 25 registration fee. New Personal accounts must also verify access to an Android device and complete a closed test with at least 12 continuously opted-in testers for 14 days before applying for production access.

Official references:

- https://support.google.com/googleplay/android-developer/answer/6112435
- https://support.google.com/android-developer-console/answer/16641046
- https://support.google.com/googleplay/android-developer/answer/14151465

The canonical Android application ID is `inmerzion.statusline`. Do not create a different Play Console package unless the product is intentionally being forked: package IDs cannot be casually renamed after publication.

## Apple App Store

The first release is **iPhone only**, including its widget. iPad remains a later product decision. The public contact and policy URLs above will be used in App Store Connect.

The canonical bundle IDs remain:

- app: `inmerzion.statusline`;
- widget: `inmerzion.statusline.widget`.
