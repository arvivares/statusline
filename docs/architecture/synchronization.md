# Synchronization and freshness

This describes the implementation in source, not a promise that an older installed
release has these changes. No relay protocol, pairing QR or server migration is needed.

## Refresh ownership

| Component                               | Trigger                                                                            | Work performed                                         | Important limit                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Tauri companion (macOS, Windows, Linux) | Native Rust timer: immediately, then every 300 seconds                             | Read Codex, encrypt and publish a successful sample    | Computer must be awake and companion running; network and OS scheduling can delay completion |
| Companion window                        | Manual refresh; foreground read if the latest operation is at least 60 seconds old | Use the same native coordinator                        | Concurrent callers reuse the in-flight operation                                             |
| iPhone app                              | On becoming active, then wait 60 seconds after each check                          | Fetch and decrypt the relay snapshot                   | Task is cancelled when the scene is inactive/backgrounded                                    |
| iOS widget                              | WidgetKit requests a timeline; next reload requested in 30 minutes                 | Independently fetch and decrypt with a bounded request | iOS decides actual execution time; 30 minutes is not an SLA                                  |

The companion's old five-minute `window.setInterval` was owned by the WebView.
The Rust timer now starts in application setup, independently of frontend readiness,
visibility and tray interactions. Missed ticks are skipped, not replayed in a burst.
Tray refresh also calls the native coordinator directly. Focus reads use its recent
result, including errors, to avoid duplicate startup requests. A failed read/publication
does not end the periodic loop.

The SwiftUI macOS target is a separate implementation, not the Tauri companion shipped
in the cross-platform installers. Its existing schedule is not changed here.
Android's existing scheduling is also unchanged by this iOS improvement.

## Widget access and cache safety

- Both iOS targets already belong to `group.inmerzion.statusline`. The reader's
  keychain item now explicitly uses that access group; no credential is put in
  UserDefaults, the relay URL, logs or widget timeline entries.
- The containing app copies its old private reader item into the shared access
  group before removing the old item. Open the app once after updating to migrate
  an existing pairing. A storage failure leaves the original credential intact.
- Publisher credentials remain private and unchanged. The widget only needs the
  reader token and decryption key. Keychain accessibility stays
  `AfterFirstUnlockThisDeviceOnly`: after a reboot, unlock the device once.
- The app writes the shared sample cache. The widget reads it and writes only its
  own cache. Locally stored relay samples carry their channel ID; samples from a
  disconnected/replaced channel are not displayed. This is **local metadata**, not
  a change to the encrypted v1 payload.
- A request returning after a pairing change is discarded. An error, timeout,
  invalid ciphertext or missing snapshot retains the last successful matching sample.
- Concurrent widget timeline loads share one request. An app sample under 60 seconds
  old avoids a redundant widget fetch. Gallery previews never make network requests.
- Widget HTTP requests use an ephemeral session, no redirects/cookies/credential
  storage, 8-second request and 10-second resource timeouts, and no connectivity wait.
  These are short inline requests during the extension's execution window, **not**
  durable background URLSession transfers or a permanently running service.

The widget shows sample age instead of an unconditional “LIVE” label. A local timeline
entry marks a sample old after 15 minutes or when its reported reset passes; it does
not fabricate a new quota or spend another network request. Reset-triggered reloads
have a five-minute minimum delay. App-triggered reloads happen only when data changes.

Apple controls widget budgets, coalescing and execution. A suspended extension might
not finish its request; it keeps the last rendered timeline until a later opportunity.
Push signaling and durable background transfers are possible future improvements,
not features implemented in this change.

References: [WidgetKit refresh policy](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date),
[network requests in extensions](https://developer.apple.com/documentation/widgetkit/making-network-requests-in-a-widget-extension),
[App Groups and Keychain sharing](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps).

## Verification

Lightweight native tests use the **production Rust module**, without Tauri/WebView,
Codex credentials or a relay connection:

```sh
cargo test --manifest-path apps/desktop/runtime-tests/Cargo.toml --locked
cargo run --manifest-path apps/desktop/runtime-tests/Cargo.toml --locked --example refresh-cadence
```

The optional second command takes ten minutes. It checks actual wall-clock ticks at
0, 300 and 600 seconds, without accelerating the timer. It does **not** prove a real
Codex read or successful relay publication. Keep the machine awake during that check.

The iOS `SyncTests` and `ReaderNetworkTests` cover independent widget reads, cache
fallback, request coalescing, channel isolation, disconnect races, foreground recovery,
cancellation and HTTP fixtures. They do not prove physical-device WidgetKit scheduling
or production Keychain provisioning.

Before distributing the next build:

1. Upgrade a **paired physical iPhone**; open the app once. Verify the old pairing
   survives, then close the app and leave the widget on the home screen.
2. On each desktop OS, hide/close the companion window without quitting. With the
   computer awake, confirm two successful publications around five minutes apart.
   Record Codex read time and relay publication time separately. Opening the window
   may trigger a refresh, so it is not evidence of the hidden-window interval.
3. Observe the phone widget obtain a newer sample without opening the app. Allow for
   iOS scheduling rather than expecting an exact 30-minute deadline.
4. Test network loss, first unlock after reboot, sleep/wake, and disconnect/re-pair
   during a pending fetch. Old samples must remain clearly old or be removed on
   disconnect, never turn into a fabricated current quota.

See [relay capacity](../relay/deployment-options.md) before increasing refresh frequency.
