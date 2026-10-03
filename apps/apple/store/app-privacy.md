# App Privacy record

Revalidate before every submission when the relay, logging, dependencies or retention policy changes.

## App Store Connect update — 2 October 2026

The authenticated portal's data-type answers were updated and published while
preparing `1.1.3 (12)`. This changes the global privacy label, not the published
app version. The distribution page still shows `1.1.1` as Ready for Distribution.
The public website policy still needs the operator's separate deployment.

| Data type             | Purpose                      | Linked | Tracking |
| --------------------- | ---------------------------- | ------ | -------- |
| Device ID             | App Functionality            | Yes    | No       |
| Product Interaction   | App Functionality            | Yes    | No       |
| Other Diagnostic Data | Analytics, App Functionality | No     | No       |
| Other Data Types      | App Functionality, Analytics | Yes    | No       |

The preview confirms linked Identifiers, Usage Data and Other Data, and unlinked
Diagnostics. No advertising purpose, account registration or tracking is added.
The localized website privacy/choices URLs are unchanged.

- Device ID covers the opt-in Firebase installation identifier and associated
  APNs delivery registration. It is retained to route alerts, not anonymized
  before collection. Apple explicitly includes device linkage in its identity
  definition; absence of a name/email is not sufficient to answer unlinked.
- Product Interaction covers the optional provider, alert/window type and
  delivery expiration processed by the relay/FCM/APNs. A weekly warning discloses
  the threshold condition, not an exact reading. These events are routed to an
  installation and therefore conservatively declared linked.
- Other Data Types retains the encrypted-relay/protocol declaration and includes
  Firebase's aggregate technical platform metadata. Its combined declaration is
  conservatively linked because a push-enabled channel retains an installation
  association; exact quota snapshots remain end-to-end encrypted.
- Other Diagnostic Data covers the actual bundled Messaging, Installations and
  GoogleDataTransport manifests. Those manifests mark SDK diagnostics unlinked
  and include Analytics and/or App Functionality. This is SDK operational
  measurement, not installation of Firebase Analytics or first-party behavioral
  analytics. No crash-reporting or advertising SDK was added.

Primary references:
[Apple's definitions](https://developer.apple.com/app-store/app-privacy-details/),
[Firebase Apple disclosure](https://firebase.google.com/docs/ios/app-store-data-collection).
The SDK manifests were inspected in the exact exported build 12, not inferred
only from a dependency list. Physical push/upgrade QA is tracked separately in
[validation-1.1.3.md](validation-1.1.3.md).

## Historical App Store Connect record — 2 September 2026

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

## Historical rationale before Firebase push

- The iPhone app contains no advertising, analytics, attribution, crash-reporting or third-party scanner SDK.
- Camera frames and decoded QR contents are processed on-device by Apple's VisionKit APIs and are not stored or transmitted as camera data.
- Fixed demo samples and previously saved local samples remain in the App Group container shared with the widget. The current app no longer accepts pasted quota/status text.
- Pairing sends random, single-purpose channel credentials to the selected relay. They are not tied to an email address, Apple ID, Codex account, advertising identifier or device identifier.
- The iPhone downloads an end-to-end encrypted quota snapshot. The relay cannot decrypt it because the AES key moves directly from the desktop QR to the phone.
- The maintained relay stores credential hashes, an opaque ciphertext and protocol timestamps. Inactive channels expire after 30 days.
- Cloudflare processes network metadata to deliver and protect HTTPS requests, but Statusline does not persist IP addresses or the rate-limit digest in D1 and persistent Worker invocation logs are disabled.

The conservative **Other Data Types** declaration covers the random channel identifier, hashes, opaque ciphertext and protocol timestamps retained by the relay for app functionality. None of them is tied to an email address, Apple ID, Codex account or device identifier, and none is used for tracking.

## Superseded push preparation notes

The original September record below predates push-enabled builds. The October
table above replaces its proposed linkage/category answers; do not use the older
unlinked declaration for a retained installation identifier.

### Periodic quota alerts (development delta)

The independent quota-alert opt-in sends a service, event/window kind and delivery
expiration to the relay and FCM/APNs. A weekly warning reveals its 20%-remaining
threshold condition, not the exact quota value, account ID, prompt or credit ID.
This operational metadata is not end-to-end encrypted and must be disclosed in
addition to the installation identifier. Before submitting, reassess **Usage Data
→ Product Interaction** (or the current form's closest quota/feature-use category)
for **App Functionality**; no advertising/tracking purpose is introduced. Do not
infer a store change from source code alone. The October table records the
observed portal update. The generic
credit-payload statement below does not describe the new typed quota alert.

The published build represented above does not include Firebase push registration. For the next build that enables reset alerts, update App Store Connect before submission:

- Add **Identifiers → Device ID**.
- Mark it as collected for **App Functionality**, **linked through the device**, and **not used for tracking**.
- This covers the opt-in Firebase Installation ID (FID) and APNs registration association used to route a generic reset alert. The app has no Statusline account and does not use the identifier for advertising or analytics.
- Firebase Messaging's Apple disclosure states that it associates the APNs token with an app installation ID; see [Firebase's current Apple data-collection disclosure](https://firebase.google.com/docs/ios/app-store-data-collection).
- The credit-alert payload sends no quota count, reset ID, expiry, prompt or account email. Periodic quota alerts additionally send the metadata disclosed above; do not apply the generic credit-alert description to them.

Recheck the current Apple questionnaire and bundled Firebase manifests when submitting. The existing live 1.0 listing is unchanged until a new version is submitted and released. See [PRIVACY.md](../../../PRIVACY.md) and [the reset-push architecture note](../../../docs/architecture/codex-reset-credits.md).

The data-disclosure answers were published on 2 September 2026, originally with relay-hosted URLs. On 10 September, the localized website URLs above were saved for the next app version, after their public destinations returned HTTP 200. Apple explicitly states URL edits are released with the next version. The data declarations were not changed; the product-page preview still reports **Data Not Linked to You → Other Data**. Do not describe the new URLs as already present on the published 1.0 listing.
