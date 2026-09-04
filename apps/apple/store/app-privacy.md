# App Privacy record

Validated against the iPhone source, Apple frameworks and the production relay on 2 September 2026. Revalidate before every submission when the relay, logging, dependencies or retention policy changes.

## Published App Store Connect answers

- Privacy Policy URL: https://statusline-relay.inmerzion.workers.dev/privacy
- Privacy Choices URL: https://statusline-relay.inmerzion.workers.dev/delete-data
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

These answers and both public privacy URLs were published in App Store Connect on 2 September 2026. The resulting product-page preview reports **Data Not Linked to You → Other Data**.
