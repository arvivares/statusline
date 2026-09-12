# Still Signature

Approved UI direction for the companion, iPhone app, Android app and home-screen
widgets. The companion and Android implementation is included in the
[`0.1.18` beta candidate](../release/notes/v0.1.18.md). Preparing the candidate does
not confirm publication; check its GitHub Release and successful release workflow.
The iPhone app/widgets require a separate manual build and store submission.
Existing store screenshots are not evidence that the design has shipped there.

## Visual contract

- One warm dark surface, no background grid or nested dashboard cards.
- System sans-serif type, tabular quota digits, restrained supporting labels.
- The remaining percentage is the primary reading. Leave 12 points/dp/CSS pixels
  between the number and its smaller percent symbol (6 in widgets).
- The `0.1.19` companion candidate is compact: 340 × 500 logical pixels (formerly
  400 × 600), 88 px primary quota digits (formerly 120), 26 px percent symbol,
  16 px heading, 15 px brand and 12 px secondary readings. Desktop controls keep
  comfortable targets (36 px for primary dialog actions); existing small
  supporting labels are not scaled down.
  This compact pass does not shrink the native mobile apps or widgets.
- Companion window radius: 28 CSS pixels. Widget containers use native clipping;
  Android's shared background uses a 28 dp radius. Mobile screens follow their
  safe areas rather than drawing another rounded panel inside the phone.
- Remaining quota is gold. The **last active stripe is completely white**,
  including at exactly 50% or 100%. Zero and missing samples have no white marker.
  The terminal stripe is a visual cursor, not an extra percentage increment.
- Stripes follow the logo's 4:2 width/gap rhythm; small widgets use 2:1.
  The track is straight, not skewed. The displayed/accessibility percentage
  remains the real normalized value, independent of the marker's pixel width.

| Token    | Value     | Purpose                          |
| -------- | --------- | -------------------------------- |
| Surface  | `#181813` | Single dark background           |
| Ink      | `#F2F0EB` | Primary text                     |
| Muted    | `#A09E97` | Secondary text                   |
| Rule     | `#3E3E37` | Occasional separators            |
| Track    | `#2F2F29` | Inactive stripes                 |
| Signal   | `#EFC65A` | Existing brand gold              |
| Terminal | `#FFFFFF` | Final active stripe              |
| Error    | `#F26856` | Errors, not freshness guarantees |

## Behavior and scope

The desktop continues to show real Codex weekly and optional short-window data,
account information and relay state. Mobile retains the weekly snapshot supported
by protocol v1; it does not invent a short-window value or Antigravity quotas.
Antigravity integration and a future multi-provider watchlist are separate work.

Refresh, pairing, manual fallback on iOS, local demos, legal links and updater
controls remain available. Advanced mobile sync controls are disclosed below the
main reading. The Android widget stays 4 × 1 by default and retains resize support.
Sample age is displayed rather than labeling a cached Android snapshot “LIVE”.
System language remains English/Spanish, with English fallback.

Existing `DataPlane*` native primitive names are kept for compatibility with
call sites, including the legacy Swift macOS target; their visual implementation
now uses Still tokens. The shipped cross-platform companion is the Tauri app.

## Window compositing

The Tauri window is transparent and its single frontend surface is rounded.
This is necessary for the outside corners to be transparent, rather than merely
rounding a panel inside an opaque rectangular native window.

On macOS, Tauri's transparent-window support requires `macos-private-api` and
`app.macOSPrivateApi`. This applies to the **direct-distribution macOS companion**
(DMG/PKG), not the Swift iOS app or its App Store submission. A future Mac App Store
target must replace this window treatment and disable the private-API flag.
Windows/Linux appearance depends on the native compositor; browser screenshots
cannot prove native corner clipping or tray behavior.

The existing focus-loss/tray policy and Rust refresh coordinator are unchanged.
Repeat the [native window checks](companion-window.md) before a release, especially
Linux/XWayland rendering and the Windows first-launch case.

## Verification

Use `npm run check` and `npm test` in `apps/desktop`; meter tests cover 0,
fractional, exact-boundary, 100 and out-of-range values. Browser preview routes
(`?preview=ready&lang=es`, `?preview=error&lang=en`, and `&panel=relay`) use
isolated sample data, never a real account.

Android `:app:testDebugUnitTest` compiles the Kotlin and resources and tests
terminal-stripe/layout policies. Swift app and widget type-checking use the
project's MainActor default isolation. Run the shared localization check as well.

Before shipping, verify physical-device widgets at minimum and normal sizes,
100% quota, empty data, larger accessibility text, EN/ES, and widget launch.
Native screenshots/store artwork must be recaptured from this build; older
store assets are deliberately not overwritten by a design-source change.
