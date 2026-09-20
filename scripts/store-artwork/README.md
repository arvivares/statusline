# Still Focus store artwork

Approved scope: **five screenshots per store, per locale** (`en-US`, `es-ES`). Still Focus applies the existing Still Signature palette and segmented logo to a calm, minimal store presentation.

Open [the gallery](index.html) to review both languages. Open [the artwork](still-focus.html?lang=en&slide=1) with `lang=en|es` and `slide=1..5` for an individual export. No network dependencies or external fonts are used.

| Order | Story                     | Native source                                      |
| ----- | ------------------------- | -------------------------------------------------- |
| 01    | Remaining quota           | App overview, public 70% local example             |
| 02    | Reset and sample age      | Detail of the same native quota view               |
| 03    | How to pair               | Actual unpaired private-sync panel; no active QR   |
| 04    | Home Screen widget        | Native medium WidgetKit widget on the QA simulator |
| 05    | Privacy and local control | Manual example saved locally, without relay writes |

## Source integrity

- Archived iOS sources: `apps/apple/store/assets/still-focus/source/{locale}/`.
- Production UI source: `09e9814b560e8b12934085a12a18f0ddaf21efe8` (v0.1.20), with iOS version metadata 1.0.3 (8). Only the UI-test harness was added for capture.
- Device: dedicated, unpaired **Statusline README QA**, iPhone 17 Pro simulator, iOS 26.3.1 (`23D8133`). Never run the harness against a physical or paired device.
- These archived captures used the public demo/manual controls and XCTest attachments. Native sources are 1206 × 2622, including Home Screen evidence cropped by the artwork to show the actual widget. The source PNGs are unretouched.
- The current `StillFocusScreenshotTests` harness uses only the fixed local demo and private-sync controls. The manual quota editor has been removed from iOS: recapture before presenting this historical artwork as a current build. The archived manual `/status` example is the original English protocol string, including in Spanish UI.
- Artwork uses proportional framing and explicit view-detail crops; no app controls, figures, connection status or OS chrome are fabricated.
- The artwork is not evidence of physical-device background-sync QA. Widget refresh is OS-managed, not guaranteed real-time.
- Privacy copy distinguishes encrypted quota snapshots from credentials. No encryption key, Codex password, API key or live pairing QR appears in any image.

## Render and verify

1. Capture the native app views in both languages using the guarded XCTest class. Manually add one medium widget at the top of Home Screen page 2 on the isolated simulator, then capture it in each system language. Restart the isolated simulator when changing its system language. Use a unique result bundle per run; export attachments with `xcresulttool export attachments`.
2. Copy only reviewed native sources into the locale directories. Keep diagnostic UI trees and Home Screen evidence outside the repository.
3. Open each artwork URL in a browser at **1320 × 2868, device scale 1**. Wait for `document.body.dataset.ready === 'true'` and all images to decode.
4. Export an opaque PNG to `apps/apple/store/assets/still-focus/{locale}/`, with the order prefix. The gallery itself is not a store image.
5. Inspect all ten PNGs: native language, correct build/design, text bounds, complete controls at crop boundaries, readable quota, white final active stripe, and no credentials or personal data. Confirm exactly five PNGs in each locale and accepted size/no alpha before upload.

Android's **five-image current-build capture set is not included here**. At the 13 September preparation session no phone or emulator was available. The template fails closed for non-iOS platform requests; do not upload iPhone artwork or the historical Android Data Plane set as the current release. Android needs its own five-image EN/ES set after native capture and layout verification, without promising unsupported feature parity. Device availability must be checked again when doing that work.

Reference: [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).

Rendering assets is not submission. Track actual store uploads and review status in the version-specific validation records.

Run `node scripts/store-artwork/validate.mjs` from the repository root to verify count, filenames, size, RGB format, PNG completeness and absence of transparency, and to print SHA-256 checksums. The checker does not replace visual review.
