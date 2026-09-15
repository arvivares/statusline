# Google Play release kit

This directory preserves Statusline's Google Play listing sources and dated delivery evidence. On **14 September 2026**, Closed testing — Alpha showed **0.1.21-alpha.1, Available to selected testers** (`versionCode 17`). Internal testing still served `0.1.9 (5)`; production access was not enabled. See [the latest verification](validation-0.1.21.md). Older submission records and screenshots below are historical, not a live store-status feed or proof that the latest artwork was published.

## Contents

- `listing/`: default English listing and Spanish localization.
- `release-notes/`: localized notes for current and previous bundles.
- [validation-0.1.21.md](validation-0.1.21.md): latest available Alpha build and closed-test eligibility verification.
- [validation-0.1.20.md](validation-0.1.20.md): previous Still Signature AAB submission.
- [validation-0.1.17.md](validation-0.1.17.md): historical AAB verification and Alpha submission.
- [validation-0.1.15.md](validation-0.1.15.md): artifact verification, Play submission evidence and remaining test gates.
- [listing-validation-2026-09-11.md](listing-validation-2026-09-11.md): live track audit, localized description draft and Android screenshot refresh.
- `app-content.md`: answers used for Play Console policy forms.
- `data-safety.md`: SDK and relay data inventory plus the declarations submitted to Google.
- `review-access.md`: reviewer instructions for the account-free local demo.
- `assets/source/`: deterministic source for generated artwork.
- `assets/app-icon.png`: 512 × 512 Play icon.
- `assets/feature-graphic.png`: 1024 × 500 feature graphic.
- `assets/phone/en-US/` and `assets/phone/es-ES/`: four historical 1080 × 1920 Android screenshots per locale, captured from 0.1.15 before Still Signature. They include the native home-screen widget but must not be advertised as current UI.
- [Screenshot provenance and order](assets/phone/README.md): source device/build, capture method and localized alternative text. The older images at `assets/phone/*.png` are historical, not the current localized set.

The screenshots are captured from the real Android build. Generated artwork uses the same Data Plane tokens as the product and does not contain the OpenAI logo or imply affiliation.

The official app icon uses the website's segmented gold **S**. Its Play icon,
legacy launcher and adaptive/themed variants are generated together from the
[shared brand kit](../../../branding/README.md). The submission recorded below
updates the bundle and release notes, not the Play listing artwork or screenshots.

The feature graphic is declared in Play Console as created or edited using AI. The app icon and four screenshots are not: the screenshots come from the physical Android build and the icon is the existing Statusline product artwork.

## Historical listing refresh — 11 September saved draft

The observations below describe the earlier listing session. They do not verify
today's draft or publication state. The requested five-image Still Focus Android
set is not included in these files; it needs native current-build captures and
a separate upload verification. Never substitute the iPhone artwork.

On 11 September 2026, the short and full English descriptions were updated and
the previously missing `es-ES` store-listing translation was added. Both locales
were saved using **Save as draft** in Play Console. These local Markdown files
match the entered text; saving them did not publish the listing or upload a new
app bundle.

The descriptions explain the Companion requirement, QR/manual pairing, demo,
English/Spanish support and end-to-end encrypted snapshots. They explicitly
describe the Android widget as displaying the app's last saved status and do not
promise continuous or five-minute background refreshes.

The localized screenshots were recaptured on the physical Android device using
an isolated temporary user and the built-in demo. The original user's app and
pairing were not replaced or disconnected. The capture build is the installed
Google Play `0.1.15 (11)`: its shown app/widget UI is unchanged in the `0.1.17`
source comparison. This does not claim that bundle 13 has been tested or
distributed through Play. See the
[capture and verification checklist](listing-validation-2026-09-11.md#remaining-work)
for the current draft/submission state.

Both Play locales now have their four new screenshots saved as draft, in the
documented order. The saved English and Spanish galleries were checked separately.
The historical screenshots were removed from the English listing, while Spanish
now uses its own localized set. No listing changes have been sent for review and
no new Alpha bundle was uploaded as part of this screenshot refresh.

## Historical Play submission — 11 September

On 11 September 2026, the verified published `v0.1.17` AAB (`versionCode 13`)
was submitted as **`0.1.17-alpha.1`**, with
[English](release-notes/0.1.17-en-US.txt) and
[Spanish](release-notes/0.1.17-es-ES.txt) release notes. No local rebuild was needed.
Play Console showed **Changes in review** at 13:06 UTC, with initial automated
checks still running. Only the Alpha release was submitted; the localized
listing refresh above remains a draft.

The release targets 100% of existing eligible Alpha testers in the same 177
countries/regions. Tester lists and managed publishing (off) were preserved.
Google must complete its checks and review before bundle 13 becomes available.
The internal-testing track remains on `0.1.9 (5)`; production was not changed.
See [submission evidence and remaining checks](validation-0.1.17.md).

## Historical available Alpha release — 10 September

On 10 September 2026, the official `v0.1.15` release bundle (`versionCode 11`)
was uploaded and submitted as **`0.1.15-alpha.1`** to **Closed testing — Alpha**,
with [English](release-notes/0.1.15-en-US.txt) and
[Spanish](release-notes/0.1.15-es-ES.txt) release notes.

Play Console initially confirmed **Changes in review**, with automated checks still
running. A later check on 10 September confirmed **Available to selected testers**
on the active Alpha track. The previous available release at submission time was
`0.1.12-alpha.1` (`versionCode 8`). This is not a production rollout.

The rollout targets 100% of the existing Alpha testers across the existing 177
countries and regions. The `Statusline Alpha` and `Statusline Internal` email
lists, production and internal-testing tracks were not changed. Managed
publishing remains off, so the Alpha update is configured to become available
after approval; no production rollout was requested.

Existing eligible testers use the same
[opt-in link](https://play.google.com/apps/testing/inmerzion.statusline) and
[Google Play listing](https://play.google.com/store/apps/details?id=inmerzion.statusline).
An email-list entry alone does not confirm that a tester has opted in.

The only bundle warning is the absence of native debug symbols for third-party native code. It does not block closed testing, but should be investigated before production so native crashes and ANRs have the best available diagnostics.

Before submitting a new build, update the version references, release notes and screenshots, then recheck the live Data safety form against every bundled SDK and the deployed relay.

## Submission history

On 2 September 2026, bundle `0.1.10` (`versionCode 6`) was submitted as closed-track release `0.1.10-alpha.1` together with the default `en-US` listing, app-content forms and Data safety declaration. That submission used the private `Statusline Internal` email list and targeted all 177 available countries and regions.
