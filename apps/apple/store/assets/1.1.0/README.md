# iOS 1.1.0 — Still Focus

Five App Store screenshots in each locale: `en-US` and `es-ES`. These replace the
Codex-only 1.0.3 artwork in the new 1.1.0 product-page submission, not in its
historical records. Native sources are retained under `source/`.

| Order | Story                     | Native UI                                         |
| ----- | ------------------------- | ------------------------------------------------- |
| 01    | Codex and Gemini together | Codex focus and Gemini watchlist                  |
| 02    | Reset and sample age      | Gemini focus and Codex watchlist                  |
| 03    | Pair once                 | Expanded private-sync panel, unpaired             |
| 04    | Home Screen widget        | Actual medium WidgetKit widget with both services |
| 05    | Privacy and control       | Private-sync explanation and legal controls       |

## Visual direction and integrity

The user explicitly retained **Still Focus**. The `ui-designer` review preserved
the approved palette (`#181813`, `#f2f0eb`, `#efc65a`), typography, brand mark,
spacing, portrait composition and segmented meter with a white final active stripe.
The composition template derives from PR #47's artwork at `a022de15`; that PR's
old iOS version metadata and unrelated Android records were not imported.

Every interface image is an unretouched capture of the real app or WidgetKit
extension from production UI source `d90231f30db5e4b9b668811003a6577ca346c0fe`
(iOS **1.1.0 (9)**). A test-only fixture writes a synthetic, unpaired local cache:
Codex 53%, Gemini 73%, current sample dates and future resets. This is not a new
in-app Gemini demo: the shipping local demo remains Codex-only. No credentials,
network session, live QR, real account or production relay was used for captures.

The two capture-test files are only in test targets; there are no production UI,
bundle-version, entitlement or release-binary changes. Simulator captures used a
locally signed Debug build of the same UI, not the distribution IPA. The uploaded
TestFlight binary is reused as-is for review.

## Capture evidence — 15 September 2026

- Dedicated unpaired `Statusline README QA`, iPhone 17 Pro simulator.
- iOS 26.3.1 (`23D8133`), Xcode 26.3 (`17C529`). Native PNGs: 1206 × 2622.
- `StoreArtworkFixtureTests` passed; both localized
  `AgentStoreScreenshotTests` app flows passed without skips.
- App captures: `Test-statusline-2026.09.15_17-21-58-+0200.xcresult`.
- English widget: `simctl io screenshot` after the same run; visually verified
  Gemini, Codex, English labels and sample age. No fabricated widget rendering.
- Spanish widget: `testSpanishWidgetHome` passed after changing the isolated
  simulator system language and restarting it;
  `Test-statusline-2026.09.15_17-25-50-+0200.xcresult`.
- Sources were reviewed for language, visible controls, timestamps and absence of
  personal data. Artwork uses proportional framing and explicit crops; no UI text,
  percentages, state labels or OS controls were repainted.

## Reproduce

Never run the fixture on a personal or paired device. Its seed test is disabled
unless the simulator name matches **and** an explicit
`tmp/statusline-store-capture.allow` marker exists inside that simulator's app
data container. The test also refuses a paired channel or paired cached data.
Remove the marker after capture. UI tests skip nonmatching simulators and refuse
to interact when the app is not unpaired.

1. On the dedicated simulator only, opt in with the marker, then run
   `StoreArtworkFixtureTests` followed by the localized `AgentStoreScreenshotTests`
   using the `statusline` scheme. Disable parallel testing. Simulator signing is
   needed for the existing shared Keychain access group; do not disable signing.
2. Keep a medium widget at the top of Home Screen page 2. Set the simulator system
   language before widget capture and restart it; app launch arguments alone do
   not localize WidgetKit. Export XCTest attachments with `xcresulttool` and review
   them before copying to the source folders.
3. Serve the repository on `127.0.0.1:8766`. Open
   `scripts/store-artwork/1.1.0.html?lang=en&slide=1` in an isolated Browser Use
   session. In its Python namespace set `repo_root` to the repository path and run
   `scripts/store-artwork/render-1.1.0.py` with `python --file`.
4. The renderer waits for decoded images, fonts and two painted frames at
   1320 × 2868, then exports ten opaque PNGs. Inspect all ten; do not treat the
   structural validator as a substitute for visual review.
5. Run `node scripts/store-artwork/validate-1.1.0.mjs` for count, order, dimensions,
   RGB/no-alpha, PNG completeness and SHA-256 checksums. Upload the **locale-level
   exports**, not `source/`, to the 6.9-inch slot; retain same-locale size scaling.

See [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
Rendering alone does not establish upload, review approval or publication; see
the [version validation record](../../validation-1.1.0.md).
