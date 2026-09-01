# Google Play Data safety inventory

Validated and submitted for Android `0.1.10` (`versionCode 6`) and the production Cloudflare relay on 2 September 2026. This is an audit record, not a substitute for rechecking the live Play Console definitions.

## Product behavior

- The app has no Statusline account, ads or advertising SDK.
- The signed bundle and project contain no `com.google.android.gms.permission.AD_ID`; the Play Advertising ID declaration is **No**.
- Camera frames and decoded QR contents are processed on-device and are not stored or sent by Statusline.
- The phone stores the relay reader credential and AES key in an Android Keystore-protected local blob.
- The relay receives a random channel ID, credential hashes, encrypted quota ciphertext and protocol timestamps. It never receives the AES key and cannot decrypt the snapshot.
- Disconnect removes local credentials. Desktop disconnect attempts immediate remote deletion; inactive channels expire after 30 days.
- Network requests use HTTPS in Release.

## Third-party SDK disclosure

The bundled ML Kit barcode scanner documents collection of app/device information, per-installation identifiers, feature events, performance measurements and error diagnostics. Google states that this data is encrypted in transit, used for diagnostics and usage analytics, and not shared with third parties. Statusline does not receive it. Auto-zoom is not enabled.

Source: https://developers.google.com/ml-kit/android-data-disclosure

## Play Console declaration

- Does the app collect or share required user data types? **Yes**, due to ML Kit diagnostics and analytics.
- Is all collected user data encrypted in transit? **Yes**.
- Can users request deletion? **Yes**. Disconnection provides in-product deletion for credentials/channel data, and the public deletion instructions are available at https://statusline-relay.inmerzion.workers.dev/delete-data.
- Data sharing: **No** for the identified ML Kit telemetry; Google documents it as service-provider processing rather than sale or transfer to third parties.
- Camera photos/video and QR content: **Not collected**, because processing is on-device and the data does not leave the device.

Declare the following collected, not shared data types for ML Kit, using the closest labels exposed by the current Play form:

| Play data type | Collected | Shared | Required | Purpose |
| --- | --- | --- | --- | --- |
| App interactions | Yes | No | Optional | Analytics |
| Diagnostics | Yes | No | Optional | Analytics |
| Other app performance data | Yes | No | Optional | Analytics |
| Device or other IDs | Yes | No | Optional | Analytics |

These types are optional because QR scanning is optional and the app retains a manual-link fallback. They are not processed ephemerally in the submitted form. No data type is declared as shared.

If the current form groups package/app version or device model under an additional **App info and performance** subtype, include it conservatively and record the exact label here after submission.

## Relay and hosting notes

Cloudflare necessarily processes IP address and request metadata to deliver and protect HTTPS traffic. Statusline does not store the IP address or its rate-limit digest in D1, and persistent Worker invocation logs are disabled. The encrypted quota payload is opaque to the relay and consists only of weekly percentage, reset time, update time and schema version. Any future analytics, crash-reporting, push notification or advertising dependency requires a new audit before release.
