# App Privacy record

Validated against the iPhone source, Apple frameworks and the production relay on 2 September 2026. Revalidate before every submission when the relay, logging, dependencies or retention policy changes.

## Current App Store Connect record

- Privacy Policy URL: https://statusline.inmerzion.io/privacy
- Privacy Choices URL: https://statusline.inmerzion.io/delete-data
- Spanish policy: https://statusline.inmerzion.io/es/privacy
- Spanish choices: https://statusline.inmerzion.io/es/delete-data
- Does this app or its third-party partners collect data? **Yes**
- Data type: **Other Data → Other Data Types**
- Purpose: **App Functionality**
- Linked to the user's identity: **No**
- Tracking: **No**
- Data used to track users: **None**
- Account deletion: Not applicable; Statusline has no user account.

## Rationale

- The iPhone app contains no advertising, analytics, attribution, crash-reporting or third-party scanner SDK.
- Camera frames and decoded QR contents are processed on-device by Apple's VisionKit APIs and are not stored or transmitted as camera data.
- Manual quota samples remain in the App Group container shared with the widget.
- Pairing sends random, single-purpose channel credentials to the selected relay. They are not tied to an email address, Apple ID, Codex account, advertising identifier or device identifier.
- The iPhone downloads an end-to-end encrypted quota snapshot. The relay cannot decrypt it because the AES key moves directly from the desktop QR to the phone.
- The maintained relay stores credential hashes, an opaque ciphertext and protocol timestamps. Inactive channels expire after 30 days.
- Cloudflare processes network metadata to deliver and protect HTTPS requests, but Statusline does not persist IP addresses or the rate-limit digest in D1 and persistent Worker invocation logs are disabled.

The conservative **Other Data Types** declaration covers the random channel identifier, hashes, opaque ciphertext and protocol timestamps retained by the relay for app functionality. None of them is tied to an email address, Apple ID, Codex account or device identifier, and none is used for tracking.

Reclassify this record before submission if production logging is enabled or analytics, crash reporting, push-token storage or other SDK telemetry is added.

The data-disclosure answers were published on 2 September 2026, originally with relay-hosted URLs. On 10 September, the localized website URLs above were saved for the next app version, after their public destinations returned HTTP 200. Apple explicitly states URL edits are released with the next version. The data declarations were not changed; the product-page preview still reports **Data Not Linked to You → Other Data**. Do not describe the new URLs as already present on the published 1.0 listing.
