# App Store screenshots

Capture the real Release UI on the largest required iPhone class so App Store Connect can scale it down. Current, unmodified upload captures live in locale-specific `phone/` directories. The original root-level `source/` and `phone/` files are historical build-1 evidence, not the current listing set.

## App icon

- The official icon is the website's segmented, upward-slanted gold **S** on the Data Plane canvas.
- Its canonical geometry and reproducible exports live in the [shared brand kit](../../../../branding/README.md). `source/app-icon.svg` is a generated, full-canvas iOS variant, not a separate master.
- Run `npm ci && npm run generate && npm run check` from `branding/` at the repository root to update the 1024 × 1024 RGB icon at `statusline/Assets.xcassets/AppIcon.appiconset/AppIcon.png` together with the other platforms. Keep the iOS canvas opaque and square; the system supplies the corner mask.
- These source assets are for the next build. Existing App Store Connect/TestFlight builds and the dated capture/submission records below are not changed by regenerating them.

## Current listing set — 1.0.1 (5)

- [English overview](phone/en-US/01-weekly-quota.png)
- [Spanish overview](phone/es-ES/01-weekly-quota.png)

Each locale currently has one reviewed screenshot: the real quota overview with a 70% local example, reset details and private pairing controls. Replace the three old images rather than mixing generations or inheriting Spanish images into English. A clean physical-iPhone widget capture can be added later; none is fabricated here.

Requirements:

- Use real app output; do not fabricate system chrome or a pairing result.
- Do not expose a live QR code, pairing token, reader token or account data.
- Keep status-bar values plausible and avoid notifications containing personal information.
- Record the exact simulator/device model, OS, build and capture command in this file when assets are generated.

## Capture provenance — 10 September 2026

- App source: `062f621440751503fa1235607ef1cb850822a330`, the source archived for `1.0.1 (5)`. Only the screenshot test harness was added; no production UI was changed for these captures.
- Xcode 26.3; iPhone 17 Pro Max simulator; iOS 26.3.1 (`23D8133`).
- Release configuration with `ENABLE_TESTABILITY=YES` for the simulator test build only, because the scheme also compiles unit tests. The uploaded distribution archive was not rebuilt or changed.
- `StoreScreenshotTests` uses public demo/manual controls on an unpaired simulator and skips physical devices. No live credentials or pairing tokens are used.
- Both language tests passed: 2 passed, 0 failed, 0 skipped. Six attachments were retained; passing UI assertions does not replace visual review.
- The two overview images passed visual review. The scrolled manual editor exposes status-bar overlap and is excluded. The simulator pairing sheet reports an unavailable camera and is also excluded. These are follow-ups, not store images.
- Native 1320 × 2868 RGB PNGs without alpha. No resizing, cropping, framing, generated UI or image editing. Upload in the 6.9-inch Media Manager class, with localized scaling for smaller displays.
- Status bar: 09:41, Wi-Fi, 100% battery. The overview contains local sample data, not a real account quota. The manual `/status` protocol example retains Codex's original English format.

Reproduce with an unpaired simulator and a unique result bundle:

```sh
xcodebuild -project apps/apple/statusline.xcodeproj -scheme statusline \
  -configuration Release \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' \
  -only-testing:statuslineUITests/StoreScreenshotTests \
  -parallel-testing-enabled NO ENABLE_TESTABILITY=YES \
  -resultBundlePath /tmp/statusline-store-captures.xcresult test
xcrun xcresulttool export attachments \
  --path /tmp/statusline-store-captures.xcresult \
  --output-path /tmp/statusline-store-capture-attachments
```

SHA-256 of the unmodified upload files:

```text
5b539d4585bdafaa94cd03863f5cd344af22faad46e7543a0dda56a40fbc8c1b  phone/en-US/01-weekly-quota.png
bea18a40acc34714671f359d7bc70b1a641f1bf0eea03b0367436f98264c186d  phone/es-ES/01-weekly-quota.png
```

## Historical captures — build 1

- Captured 2 September 2026 from the real Debug build for version `1.0` (`1`).
- Source device: iPhone 17 Pro Max simulator, iOS 26.3.1, 1320 × 2868 pixels.
- Status bar normalized to 09:41, full Wi-Fi/cellular signal and full battery.
- UI tests validated the demo, pairing sheet and manual editor before retaining screenshots.
- App Store Connect requested its 6.5-inch upload class for this record. The three `phone/` assets were proportionally scaled and center-cropped from the source captures to an accepted 1284 × 2778 pixels.
- `phone/01-weekly-quota.png`, `phone/02-private-pairing.png` and `phone/03-local-control.png` are flattened RGB PNGs without alpha and were uploaded successfully in that order.
- A clean physical-iPhone widget capture remains an optional fourth product-page image. Functional widget QA passed from TestFlight build `1` on 3 September; the first three screenshots already satisfy Apple's minimum screenshot count.
