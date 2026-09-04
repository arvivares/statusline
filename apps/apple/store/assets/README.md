# App Store screenshots

Capture the real Release UI on the largest required iPhone class so App Store Connect can scale it down. Keep original, unframed PNG captures in `source/` and final upload assets in `phone/`.

## App icon

- `source/app-icon.svg` is the opaque iOS master for the shared Data Plane icon used by Android and desktop.
- The geometry and palette match `apps/desktop/src-tauri/icons/app-icon.svg`; only the full-canvas `#0D0E0B` background differs because App Store icons cannot contain transparency.
- Render it at 1024 × 1024, flatten it to RGB, and place the result at `statusline/Assets.xcassets/AppIcon.appiconset/AppIcon.png`.

## Listing order

1. `01-weekly-quota.png` — 70% local demo with reset date and Data Plane meter.
2. `02-private-pairing.png` — pairing sheet with the safe manual-link fallback visible.
3. `03-local-control.png` — manual `/status` input and relay controls.
4. `04-home-widget.png` — Statusline widget on the iPhone Home Screen; physical-device capture pending.

Requirements:

- Use real app output; do not fabricate system chrome or a pairing result.
- Do not expose a live QR code, pairing token, reader token or account data.
- Keep status-bar values plausible and avoid notifications containing personal information.
- Record the exact simulator/device model, OS, build and capture command in this file when assets are generated.

## Current captures

- Captured 2 September 2026 from the real Debug build for version `1.0` (`1`).
- Source device: iPhone 17 Pro Max simulator, iOS 26.3.1, 1320 × 2868 pixels.
- Status bar normalized to 09:41, full Wi-Fi/cellular signal and full battery.
- UI tests validated the demo, pairing sheet and manual editor before retaining screenshots.
- App Store Connect requested its 6.5-inch upload class for this record. The three `phone/` assets were proportionally scaled and center-cropped from the source captures to an accepted 1284 × 2778 pixels.
- `phone/01-weekly-quota.png`, `phone/02-private-pairing.png` and `phone/03-local-control.png` are flattened RGB PNGs without alpha and were uploaded successfully in that order.
- A clean physical-iPhone widget capture remains an optional fourth product-page image. Functional widget QA passed from TestFlight build `1` on 3 September; the first three screenshots already satisfy Apple's minimum screenshot count.
